'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback, useRef } from 'react';
import { SavedSubtitle } from '../lib/db';

interface SubtitleConfig {
    apiKey: string;
}

interface SubtitleResult {
    id: string;
    attributes: {
        language: string;
        download_count: number;
        hearing_impaired: boolean;
        release: string;
        uploader: {
            name: string;
        };
        files: Array<{
            file_id: number;
            file_name: string;
        }>;
        feature_details?: {
            movie_name?: string;
            year?: number;
            season_number?: number;
            episode_number?: number;
        };
    };
}

interface SubtitleContextType {
    config: SubtitleConfig | null;
    isConfigured: boolean;
    isLoading: boolean;
    /** False until the lazy config load has settled, so UIs don't read `isConfigured` too early. */
    isConfigResolved: boolean;
    remainingDownloads: number | null;
    /** Loads the config on first real need. Subtitle UIs must call this on mount/open. */
    ensureConfigLoaded: () => Promise<void>;
    saveConfig: (apiKey: string) => Promise<boolean>;
    clearConfig: () => Promise<void>;
    searchSubtitles: (params: {
        query?: string;
        languages?: string;
        season_number?: number;
        episode_number?: number;
        year?: number;
        tmdb_id?: number | string;
        parent_tmdb_id?: number | string;
    }) => Promise<SubtitleResult[]>;
    downloadSubtitle: (fileId: number, streamId: string) => Promise<string | null>;
    getSavedSubtitle: (streamId: string) => Promise<SavedSubtitle | undefined>;
    clearSavedSubtitle: (streamId: string) => Promise<void>;
}

const SubtitleContext = createContext<SubtitleContextType | undefined>(undefined);

export function SubtitleProvider({ children }: { children: ReactNode }) {
    const [config, setConfig] = useState<SubtitleConfig | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isConfigResolved, setIsConfigResolved] = useState(false);
    const [remainingDownloads, setRemainingDownloads] = useState<number | null>(null);
    // Best practice: cache search results to reduce redundant API calls
    const searchCacheRef = useRef<Map<string, { data: SubtitleResult[]; timestamp: number }>>(new Map());
    // Mirrors `config` so callbacks can read it after awaiting the lazy load,
    // where the value captured in their closure would still be stale.
    const configRef = useRef<SubtitleConfig | null>(null);
    // Holds the in-flight (or settled) load so concurrent callers share it.
    const configLoadRef = useRef<Promise<void> | null>(null);

    const applyConfig = useCallback((next: SubtitleConfig | null) => {
        configRef.current = next;
        setConfig(next);
        setIsConfigResolved(true);
        // A config written locally is authoritative, so a later lazy load
        // must not re-fetch and clobber it.
        configLoadRef.current = Promise.resolve();
    }, []);

    const ensureConfigLoaded = useCallback((): Promise<void> => {
        if (configLoadRef.current) return configLoadRef.current;

        const loadConfig = async () => {
            setIsLoading(true);
            try {
                const response = await fetch('/api/subtitles/config');
                if (response.ok) {
                    const data = await response.json();
                    if (data.apiKey) {
                        applyConfig({ apiKey: data.apiKey });
                    }
                }
            } catch (error) {
                console.error('[SubtitleContext] Failed to load config:', error);
            } finally {
                setIsLoading(false);
                setIsConfigResolved(true);
            }
        };

        configLoadRef.current = loadConfig();
        return configLoadRef.current;
    }, [applyConfig]);

    const saveConfigHandler = useCallback(async (apiKey: string): Promise<boolean> => {
        try {
            // Save to backend (which validates the key)
            const response = await fetch('/api/subtitles/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ apiKey }),
            });

            if (!response.ok) {
                const error = await response.json();
                console.error('[SubtitleContext] Failed to save config:', error);
                return false;
            }

            const { config: newConfig } = await response.json();
            applyConfig({ apiKey: newConfig.apiKey });
            return true;
        } catch (error) {
            console.error('[SubtitleContext] Failed to save config:', error);
            return false;
        }
    }, [applyConfig]);

    const clearConfigHandler = useCallback(async () => {
        try {
            await fetch('/api/subtitles/config', {
                method: 'DELETE',
            });
            applyConfig(null);
        } catch (error) {
            console.error('[SubtitleContext] Failed to clear config:', error);
        }
    }, [applyConfig]);

    const searchSubtitles = useCallback(async (params: {
        query?: string;
        languages?: string;
        season_number?: number;
        episode_number?: number;
        year?: number;
        tmdb_id?: number | string;
        parent_tmdb_id?: number | string;
    }): Promise<SubtitleResult[]> => {
        await ensureConfigLoaded();
        const activeConfig = configRef.current;
        if (!activeConfig) return [];

        // Best practice: cache search results (5 min TTL)
        const cacheKey = JSON.stringify(params);
        const cached = searchCacheRef.current.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
            return cached.data;
        }

        try {
            const response = await fetch('/api/subtitles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'search',
                    apiKey: activeConfig.apiKey,
                    ...params,
                }),
            });

            if (!response.ok) {
                console.error('[SubtitleContext] Search failed:', response.status);
                return [];
            }

            const data = await response.json();
            const results = data.data || [];

            // Cache the results
            searchCacheRef.current.set(cacheKey, { data: results, timestamp: Date.now() });

            return results;
        } catch (error) {
            console.error('[SubtitleContext] Search error:', error);
            return [];
        }
    }, [ensureConfigLoaded]);

    const downloadSubtitle = useCallback(async (fileId: number, streamId: string): Promise<string | null> => {
        await ensureConfigLoaded();
        const activeConfig = configRef.current;
        if (!activeConfig) return null;

        try {
            const response = await fetch('/api/subtitles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'download',
                    apiKey: activeConfig.apiKey,
                    file_id: fileId,
                }),
            });

            // Handle download quota exceeded
            if (response.status === 407) {
                const data = await response.json();
                alert(data.error || 'Limite diário de downloads atingido.');
                return null;
            }

            if (!response.ok) {
                console.error('[SubtitleContext] Download failed:', response.status);
                return null;
            }

            // Track remaining downloads from response header
            const remaining = response.headers.get('X-Downloads-Remaining');
            if (remaining) {
                setRemainingDownloads(parseInt(remaining));
            }

            // Response is raw VTT content
            const vtt = await response.text();

            if (!vtt || !vtt.startsWith('WEBVTT')) {
                console.error('[SubtitleContext] Invalid VTT content received');
                return null;
            }

            // Save for persistence to server
            try {
                await fetch('/api/subtitles/user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        streamId: String(streamId),
                        vtt,
                        language: 'pt-BR'
                    })
                });
            } catch (err) {
                console.warn('[SubtitleContext] Failed to sync subtitle to server:', err);
            }

            const blob = new Blob([vtt], { type: 'text/vtt' });
            return URL.createObjectURL(blob);
        } catch (error) {
            console.error('[SubtitleContext] Download error:', error);
            return null;
        }
    }, [ensureConfigLoaded]);

    const getSavedSubtitle = useCallback(async (streamId: string) => {
        try {
            const response = await fetch(`/api/subtitles/user?streamId=${streamId}`);
            if (response.ok) {
                return await response.json();
            }
        } catch (err) {
            console.warn('[SubtitleContext] Failed to fetch saved subtitle:', err);
        }
        return null;
    }, []);

    const clearSavedSubtitle = useCallback(async (streamId: string) => {
        try {
            await fetch(`/api/subtitles/user?streamId=${streamId}`, {
                method: 'DELETE'
            });
        } catch (err) {
            console.warn('[SubtitleContext] Failed to clear saved subtitle:', err);
        }
    }, []);

    return (
        <SubtitleContext.Provider
            value={{
                config,
                isConfigured: !!config,
                isLoading,
                isConfigResolved,
                remainingDownloads,
                ensureConfigLoaded,
                saveConfig: saveConfigHandler,
                clearConfig: clearConfigHandler,
                searchSubtitles,
                downloadSubtitle,
                getSavedSubtitle,
                clearSavedSubtitle,
            }}
        >
            {children}
        </SubtitleContext.Provider>
    );
}

export function useSubtitle() {
    const context = useContext(SubtitleContext);
    if (!context) {
        throw new Error('useSubtitle must be used within a SubtitleProvider');
    }
    return context;
}

export type { SubtitleResult };
