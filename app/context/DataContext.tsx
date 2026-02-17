'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import * as db from '../lib/db';

interface DataContextType {
    isSyncing: boolean;
    lastSync: number | null;
    syncProgress: number;
    syncData: () => Promise<void>;
    getCachedCategories: (type: 'live' | 'movie' | 'series') => Promise<db.CachedCategory[]>;
    getCachedStreams: (categoryId: string, type: 'live' | 'movie' | 'series') => Promise<db.CachedStream[]>;
    getAllCachedStreams: (type?: 'live' | 'movie' | 'series') => Promise<db.CachedStream[]>;
    getCachedDetail: (id: string | number) => Promise<any | undefined>;
    saveCachedDetail: (id: string | number, data: any) => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
    const { credentials } = useAuth();
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState(0);
    const [lastSync, setLastSync] = useState<number | null>(null);


    const fetchAllDataByType = async (type: 'live' | 'movie' | 'series', action: string, progressStart: number, progressWeight: number) => {
        if (!credentials) return;

        try {
            // 1. Fetch Categories
            const catAction = type === 'movie' ? 'get_vod_categories' :
                type === 'series' ? 'get_series_categories' :
                    'get_live_categories';

            const catRes = await fetch('/api/proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...credentials, action: catAction })
            });
            const categories = await catRes.json();

            if (Array.isArray(categories)) {
                await db.saveCategories(categories.map(c => ({ ...c, type })));
            }

            // 2. Fetch all streams/vods/series
            const streamRes = await fetch('/api/proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...credentials, action })
            });
            const items = await streamRes.json();

            if (Array.isArray(items)) {
                const total = items.length;
                if (total === 0) {
                    setSyncProgress(Math.round(progressStart + progressWeight));
                    return;
                }

                const batchSize = 1000; // Larger batches for speed
                for (let i = 0; i < total; i += batchSize) {
                    const batch = items.slice(i, i + batchSize).map(item => ({
                        id: String(item.stream_id || item.series_id),
                        category_id: String(item.category_id),
                        name: item.name,
                        type,
                        icon: item.stream_icon || item.cover,
                        rating: item.rating,
                        added: item.added,
                        data: item
                    }));
                    await db.saveStreams(batch);

                    const currentProgress = progressStart + ((Math.min(i + batchSize, total) / total) * progressWeight);
                    setSyncProgress(Math.round(currentProgress));
                }
            } else {
                setSyncProgress(Math.round(progressStart + progressWeight));
            }
        } catch (error) {
            console.error(`Sync error for ${type}:`, error);
            setSyncProgress(Math.round(progressStart + progressWeight));
        }
    };

    const syncData = useCallback(async () => {
        if (!credentials || isSyncing) return;

        setIsSyncing(true);
        setSyncProgress(0);

        try {
            // Sequential sync to avoid overwhelming the browser/API
            await fetchAllDataByType('live', 'get_live_streams', 0, 33);
            await fetchAllDataByType('movie', 'get_vod_streams', 33, 33);
            await fetchAllDataByType('series', 'get_series', 66, 34);

            const timestamp = Date.now();
            await db.saveSyncMetadata({ type: 'categories', lastSync: timestamp });
            setLastSync(timestamp);
            setSyncProgress(100);
        } finally {
            setTimeout(() => {
                setIsSyncing(false);
                setSyncProgress(0);
            }, 1000);
        }
    }, [credentials, isSyncing]);

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
