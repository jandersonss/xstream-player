'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import * as db from '../lib/db';
import { getDeviceProfile } from '../lib/deviceProfile';
import { streamSyncStreams } from '../lib/streamSync';

interface DataContextType {
    isSyncing: boolean;
    lastSync: number | null;
    syncProgress: number;
    syncData: () => Promise<void>;
    cancelSync: () => void;
    getCachedCategories: (type: 'live' | 'movie' | 'series') => Promise<db.CachedCategory[]>;
    getCachedStreams: (categoryId: string, type: 'live' | 'movie' | 'series') => Promise<db.CachedStream[]>;
    getAllCachedStreams: (type?: 'live' | 'movie' | 'series') => Promise<db.CachedStream[]>;
    getCachedDetail: (id: string | number) => Promise<any | undefined>;
    saveCachedDetail: (id: string | number, data: any) => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);



/**
 * Extract only necessary fields from raw API items.
 * This eliminates storing the full raw JSON blob (~70% storage reduction).
 */
function mapItemToSlimStream(item: any, type: 'live' | 'movie' | 'series'): db.CachedStream {
    return {
        id: String(item.stream_id || item.series_id),
        category_id: String(item.category_id),
        name: item.name || '',
        type,
        icon: item.stream_icon || item.cover || undefined,
        rating: item.rating || undefined,
        added: item.added || undefined,
        // Do NOT normalize here — defer to lazy normalization
        normalized_name: undefined,
        // Additional fields used by listing pages
        container_extension: item.container_extension || undefined,
        epg_channel_id: item.epg_channel_id || undefined,
        stream_type: item.stream_type || undefined,
        cover: item.cover || undefined,
        plot: item.plot || undefined,
        cast: item.cast || undefined,
        director: item.director || undefined,
        genre: item.genre || undefined,
        release_date: item.releaseDate || item.release_date || undefined,
        rating_5based: item.rating_5based || undefined,
        backdrop_path: item.backdrop_path || undefined,
        last_modified: item.last_modified || undefined,
    };
}

/**
 * Yield to the event loop to prevent UI freezing on low-power devices.
 * Essential for webOS 4 (Chrome 60) with limited CPU.
 */
function yieldToEventLoop(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

export function DataProvider({ children }: { children: React.ReactNode }) {
    const { credentials } = useAuth();
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState(0);
    const [lastSync, setLastSync] = useState<number | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    /**
     * Fetch streams page by page from the paginated proxy.
     * Each page is processed and saved to SQLite immediately, so the client
     * never holds more than SYNC_PAGE_SIZE items in memory at once.
     */
    const fetchStreamsPaginated = async (
        type: 'live' | 'movie' | 'series',
        action: string,
        progressStart: number,
        progressWeight: number,
        signal: AbortSignal
    ) => {
        if (!credentials) return;

        const profile = getDeviceProfile();
        const pageSize = profile.syncPageSize;

        let page = 1;
        let hasMore = true;
        let total = 0;
        let processed = 0;

        console.log(`[Sync] Starting ${type} with pageSize=${pageSize} (${profile.description})`);

        while (hasMore) {
            if (signal.aborted) return;

            const res = await fetch('/api/proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...credentials,
                    action,
                    page,
                    limit: pageSize
                }),
                signal
            });

            const result = await res.json();

            // Check if it's a paginated response
            if (result.items && Array.isArray(result.items)) {
                total = result.total || 0;
                hasMore = result.hasMore || false;

                if (result.items.length > 0) {
                    const batch = result.items.map((item: any) =>
                        mapItemToSlimStream(item, type)
                    );
                    await db.saveStreams(batch);
                    processed += batch.length;
                }

                // Update progress
                const fraction = total > 0 ? processed / total : 1;
                const currentProgress = progressStart + (fraction * progressWeight);
                setSyncProgress(Math.round(currentProgress));

                // Yield to event loop between pages (skip on high-end devices)
                if (profile.yieldBetweenBatches) {
                    await yieldToEventLoop();
                }

                page++;
            } else {
                // Fallback: non-paginated response (e.g. categories or errors)
                // Should not happen for stream actions, but handle gracefully
                if (Array.isArray(result)) {
                    total = result.length;
                    for (let i = 0; i < total; i += pageSize) {
                        if (signal.aborted) return;
                        const batch = result.slice(i, i + pageSize).map((item: any) =>
                            mapItemToSlimStream(item, type)
                        );
                        await db.saveStreams(batch);
                        if (profile.yieldBetweenBatches) {
                            await yieldToEventLoop();
                        }

                        const currentProgress = progressStart + ((Math.min(i + pageSize, total) / total) * progressWeight);
                        setSyncProgress(Math.round(currentProgress));
                    }
                }
                hasMore = false;
            }
        }

        if (total === 0) {
            setSyncProgress(Math.round(progressStart + progressWeight));
        }

        console.log(`[Sync] ${type}: ${processed} items synced in ${page - 1} pages`);
    };

    const fetchAllDataByType = async (
        type: 'live' | 'movie' | 'series',
        action: string,
        progressStart: number,
        progressWeight: number,
        signal: AbortSignal
    ) => {
        if (!credentials) return;

        try {
            if (signal.aborted) return;

            // 1. Fetch Categories (small, non-paginated)
            const catAction = type === 'movie' ? 'get_vod_categories' :
                type === 'series' ? 'get_series_categories' :
                    'get_live_categories';

            const catRes = await fetch('/api/proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...credentials, action: catAction }),
                signal
            });
            const categories = await catRes.json();

            if (Array.isArray(categories)) {
                await db.saveCategories(categories.map(c => ({ ...c, type })));
            }

            if (signal.aborted) return;

            // 2. Fetch streams
            const profile = getDeviceProfile();
            if (profile.useStreaming) {
                console.log(`[Sync] Starting streaming sync for ${type} (${profile.description})`);
                await streamSyncStreams({
                    type,
                    action,
                    credentials,
                    signal,
                    mapItem: mapItemToSlimStream,
                    onProgress: (processed, total) => {
                        const fraction = total > 0 ? processed / total : 1;
                        const currentProgress = progressStart + (fraction * progressWeight);
                        setSyncProgress(Math.round(currentProgress));
                    }
                });
            } else {
                // Fallback to paginated sync
                await fetchStreamsPaginated(type, action, progressStart, progressWeight, signal);
            }

        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.log(`Sync cancelled for ${type}`);
                return;
            }
            console.error(`Sync error for ${type}:`, error);
            setSyncProgress(Math.round(progressStart + progressWeight));
        }
    };

    const cancelSync = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
            setIsSyncing(false);
            setSyncProgress(0);
            console.log('Sync cancelled by user');
        }
    }, []);

    const syncData = useCallback(async () => {
        if (!credentials || isSyncing) return;

        // Cancel any previous sync
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;

        setIsSyncing(true);
        setSyncProgress(0);

        try {
            const profile = getDeviceProfile();
            
            if (profile.parallelSync && profile.useStreaming) {
                // Parallel sync for medium+ devices
                console.log('[Sync] Running parallel sync (live + vod)');
                // Create intermediate progress trackers
                let liveProgress = 0;
                let vodProgress = 0;
                
                const updateCombinedProgress = () => {
                    const combined = Math.min(90, liveProgress + vodProgress);
                    setSyncProgress(Math.round(combined));
                };

                await Promise.all([
                    fetchAllDataByType('live', 'get_live_streams', 0, 15, controller.signal).then(() => {
                        liveProgress = 15;
                        updateCombinedProgress();
                    }),
                    fetchAllDataByType('movie', 'get_vod_streams', 15, 75, controller.signal).then(() => {
                        vodProgress = 75;
                        updateCombinedProgress();
                    })
                ]);
                
                if (!controller.signal.aborted) {
                    await fetchAllDataByType('series', 'get_series', 90, 10, controller.signal);
                }
            } else {
                // Sequential sync to avoid overwhelming the browser/API on low-end devices
                console.log('[Sync] Running sequential sync');
                await fetchAllDataByType('live', 'get_live_streams', 0, 15, controller.signal);
                await fetchAllDataByType('movie', 'get_vod_streams', 15, 75, controller.signal);
                await fetchAllDataByType('series', 'get_series', 90, 10, controller.signal);
            }

            if (!controller.signal.aborted) {
                const timestamp = Date.now();
                await db.saveSyncMetadata({ type: 'categories', lastSync: timestamp });
                setLastSync(timestamp);
                setSyncProgress(100);
            }
        } finally {
            if (abortControllerRef.current === controller) {
                abortControllerRef.current = null;
            }
            setTimeout(() => {
                setIsSyncing(false);
                setSyncProgress(0);
            }, 1000);
        }
    }, [credentials, isSyncing]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    useEffect(() => {
        const initData = async () => {
            const meta = await db.getSyncMetadata('categories');
            if (meta) {
                setLastSync(meta.lastSync);

                // Check if last sync was more than 24h ago
                const oneDay = 24 * 60 * 60 * 1000;
                const now = Date.now();
                if (credentials && !isSyncing && (now - meta.lastSync > oneDay)) {
                    console.log('Sincronizando conteúdo automaticamente (diário)...');
                    syncData();
                }
            } else if (credentials && !isSyncing) {
                // Auto sync if no data found but logged in
                console.log('Sincronizando conteúdo automaticamente...');
                syncData();
            }
        };
        initData();
    }, [credentials, isSyncing, syncData]);

    const getCachedCategories = useCallback(async (type: 'live' | 'movie' | 'series') => {
        return db.getCategories(type);
    }, []);

    const getCachedStreams = useCallback(async (categoryId: string, type: 'live' | 'movie' | 'series') => {
        return db.getStreams(categoryId, type);
    }, []);

    const getAllCachedStreams = useCallback(async (type?: 'live' | 'movie' | 'series') => {
        return db.getAllStreams(type);
    }, []);

    const getCachedDetail = useCallback(async (id: string | number) => {
        return db.getDetail(id);
    }, []);

    const saveCachedDetail = useCallback(async (id: string | number, data: any) => {
        await db.saveDetail(id, data);
    }, []);

    return (
        <DataContext.Provider value={{
            isSyncing,
            lastSync,
            syncProgress,
            syncData,
            cancelSync,
            getCachedCategories,
            getCachedStreams,
            getAllCachedStreams,
            getCachedDetail,
            saveCachedDetail
        }}>
            {children}
        </DataContext.Provider>
    );
}

export function useData() {
    const context = useContext(DataContext);
    if (context === undefined) {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
}
