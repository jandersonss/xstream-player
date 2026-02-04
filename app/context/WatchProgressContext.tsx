'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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

            const timeoutId = setTimeout(syncProgress, 2000); // 2s debounce to avoid too many writes
            return () => clearTimeout(timeoutId);
        }
    }, [progressMap, isLoaded]);

    const updateProgress = (progress: WatchProgress) => {
        setProgressMap(prev => ({
            ...prev,
            [progress.streamId]: progress
        }));
    };

    const getProgress = (streamId: string | number) => {
        return progressMap[String(streamId)];
    };

    return (
        <WatchProgressContext.Provider value={{ progressMap, updateProgress, getProgress }}>
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
