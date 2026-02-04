'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';

export interface WatchProgress {
    streamId: string | number;
    type: 'movie' | 'series';
    progress: number; // current time in seconds
    duration: number; // total duration in seconds
    timestamp: number; // last updated
    name: string;
    image?: string;
    episodeId?: string | number; // for series
    seriesId?: string | number; // for series
    seasonNum?: number; // for series
    episodeNum?: number; // for series
}

interface WatchProgressState {
    progressMap: Record<string, WatchProgress>;
    updateProgress: (progress: WatchProgress) => void;
    getProgress: (streamId: string | number) => WatchProgress | undefined;
}

const WatchProgressContext = createContext<WatchProgressState | undefined>(undefined);

export const WatchProgressProvider = ({ children }: { children: ReactNode }) => {
    const [progressMap, setProgressMap] = useState<Record<string, WatchProgress>>({});
    const [isLoaded, setIsLoaded] = useState(false);

    // Load from Backend on mount
    useEffect(() => {
        const loadProgress = async () => {
            try {
                const res = await fetch('/api/watch-progress');
                if (res.ok) {
                    const data = await res.json();
                    setProgressMap(data);
                }
            } catch (e) {
                console.error("Failed to fetch watch progress from backend", e);
                const stored = localStorage.getItem('xstream_watch_progress');
                if (stored) {
                    try {
                        setProgressMap(JSON.parse(stored));
                    } catch (e) {
                        console.error("Failed to parse localStorage progress", e);
                    }
                }
            } finally {
                setIsLoaded(true);
            }
        };
        loadProgress();
    }, []);

    // Save to Backend whenever progressMap changes (debounced? maybe later)
    useEffect(() => {
        if (isLoaded) {
            localStorage.setItem('xstream_watch_progress', JSON.stringify(progressMap));

            const syncProgress = async () => {
                try {
                    await fetch('/api/watch-progress', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(progressMap)
                    });
                } catch (e) {
                    console.error("Failed to sync progress to backend", e);
                }
            };

            const timeoutId = setTimeout(syncProgress, 5000); // 5s debounce to avoid too many writes
            return () => clearTimeout(timeoutId);
        }
    }, [progressMap, isLoaded]);

    const updateProgress = useCallback((progress: WatchProgress) => {
        setProgressMap(prev => {
            const existing = prev[progress.streamId];
            // Only update if progress has changed significantly (more than 5 seconds)
            // or if it's a new entry
            if (!existing || Math.abs(existing.progress - progress.progress) > 5 || existing.episodeId !== progress.episodeId) {
                return {
                    ...prev,
                    [progress.streamId]: progress
                };
            }
            return prev;
        });
    }, []);

    const getProgress = useCallback((streamId: string | number) => {
        return progressMap[String(streamId)];
    }, [progressMap]);

    const value = useMemo(() => ({
        progressMap,
        updateProgress,
        getProgress
    }), [progressMap, updateProgress, getProgress]);

    return (
        <WatchProgressContext.Provider value={value}>
            {children}
        </WatchProgressContext.Provider>
    );
};

export const useWatchProgress = () => {
    const context = useContext(WatchProgressContext);
    if (context === undefined) {
        throw new Error('useWatchProgress must be used within a WatchProgressProvider');
    }
    return context;
};
