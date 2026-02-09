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
    detailedProgressMap: Record<string, Record<string, WatchProgress>>;
    loadingDetails: Record<string, boolean>;
    updateProgress: (progress: WatchProgress) => void;
    getProgress: (streamId: string | number) => WatchProgress | undefined;
    loadDetail: (type: 'series' | 'movie', id: string | number) => Promise<void>;
    isLoaded: boolean;
}

const WatchProgressContext = createContext<WatchProgressState | undefined>(undefined);

export const WatchProgressProvider = ({ children }: { children: ReactNode }) => {
    const [progressMap, setProgressMap] = useState<Record<string, WatchProgress>>(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('xstream_watch_progress');
                return saved ? JSON.parse(saved) : {};
            } catch (e) {
                return {};
            }
        }
        return {};
    });
    const [detailedProgressMap, setDetailedProgressMap] = useState<Record<string, Record<string, WatchProgress>>>({});
    const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});
    const [isLoaded, setIsLoaded] = useState(false);

    // Load from Backend on mount and update cache
    useEffect(() => {
        const loadProgress = async () => {
            try {
                const res = await fetch('/api/watch-progress');
                if (res.ok) {
                    const data = await res.json();
                    setProgressMap(data);
                    localStorage.setItem('xstream_watch_progress', JSON.stringify(data));
                }
            } catch (e) {
                console.error("Failed to fetch watch progress from backend", e);
            } finally {
                setIsLoaded(true);
            }
        };
        loadProgress();
    }, []);

    const loadDetail = useCallback(async (type: 'series' | 'movie', id: string | number) => {
        const key = `${type}-${id}`;
        setLoadingDetails(prev => ({ ...prev, [key]: true }));

        try {
            const res = await fetch(`/api/watch-progress/${type}/${id}`);
            if (res.ok) {
                const data = await res.json();
                setDetailedProgressMap(prev => {
                    if (JSON.stringify(prev[key]) === JSON.stringify(data)) return prev;
                    return {
                        ...prev,
                        [key]: type === 'movie' ? { [String(id)]: data } : data
                    };
                });
            }
        } catch (e) {
            console.error(`Failed to fetch detailed progress for ${key}`, e);
        } finally {
            setLoadingDetails(prev => ({ ...prev, [key]: false }));
        }
    }, []);

    // Save summary to Backend occasionally (bulk sync from localStorage if needed)
    useEffect(() => {
        if (isLoaded) {
            localStorage.setItem('xstream_watch_progress', JSON.stringify(progressMap));
        }
    }, [progressMap, isLoaded]);

    const updateProgress = useCallback((progress: WatchProgress) => {
        setProgressMap(prev => {
            const contentId = progress.type === 'series' ? String(progress.seriesId) : String(progress.streamId);
            const existing = prev[contentId];

            // If this update is for the SAME episode as the summary, check for 0-progress overwrite
            const isSameEpisode = existing && (
                progress.type === 'movie' ||
                (progress.type === 'series' && String(existing.episodeId) === String(progress.episodeId))
            );

            // Guard: Don't let a 0-progress update overwrite a non-zero progress for the same content
            if (isSameEpisode && progress.progress === 0 && existing.progress > 0) {
                console.log(`[WatchProgress] Ignoring 0-progress update for ${contentId} to prevent overwrite.`);
                return prev;
            }

            // Guard against invalid duration if we have a better one
            const finalDuration = (progress.duration && progress.duration > 0)
                ? progress.duration
                : (existing?.duration || 0);

            const updatedProgress = { ...progress, duration: finalDuration };

            // Only update if progress has changed significantly (more than 5 seconds)
            // or if it's a new entry, or if duration finally arrived, or if episode changed
            const progressDiff = existing ? Math.abs(existing.progress - progress.progress) : 0;
            const isNewEntry = !existing;
            const episodeChanged = existing?.episodeId !== progress.episodeId;
            const durationArrived = !existing?.duration && finalDuration > 0;

            if (isNewEntry || progressDiff > 5 || episodeChanged || durationArrived) {
                // Sync to granular API immediately
                const type = progress.type;
                const id = contentId;

                fetch(`/api/watch-progress/${type}/${id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedProgress)
                }).catch(e => console.error(`Failed to sync granular progress for ${type}-${id}`, e));

                const newMap = {
                    ...prev,
                    [contentId]: updatedProgress
                };

                // Also update detailed map if it's already loaded
                if (progress.type === 'series' && progress.seriesId) {
                    const key = `series-${progress.seriesId}`;
                    setDetailedProgressMap(prevDetails => {
                        const existingDetailSet = prevDetails[key];
                        if (!existingDetailSet) return prevDetails;

                        const epsId = String(progress.episodeId);
                        const existingInDetail = existingDetailSet[epsId];

                        // Same guard for detailed map
                        if (existingInDetail && progress.progress === 0 && existingInDetail.progress > 0) {
                            return prevDetails;
                        }

                        const detailDuration = (progress.duration && progress.duration > 0)
                            ? progress.duration
                            : (existingInDetail?.duration || 0);

                        return {
                            ...prevDetails,
                            [key]: {
                                ...existingDetailSet,
                                [epsId]: { ...progress, duration: detailDuration }
                            }
                        };
                    });
                }

                return newMap;
            }
            return prev;
        });
    }, []);

    const getProgress = useCallback((id: string | number) => {
        if (!id) return undefined;
        const sid = String(id);

        // 1. Direct hit (Movie or exact ID match)
        const summary = progressMap[sid];
        if (summary) return summary;

        // 2. Check if it's a series episode stored under a seriesId key in the summary
        for (const key in progressMap) {
            const p = progressMap[key];
            if (p.type === 'series' && (String(p.episodeId) === sid || String(p.streamId) === sid)) {
                return p;
            }
        }

        // 3. Search in detailed maps (for older episodes not in summary)
        for (const key in detailedProgressMap) {
            const detailSet = detailedProgressMap[key];
            if (detailSet[sid]) return detailSet[sid];

            // Fallback: search within the detail set too
            for (const dKey in detailSet) {
                const p = detailSet[dKey];
                if (String(p.episodeId) === sid || String(p.streamId) === sid) {
                    return p;
                }
            }
        }

        return undefined;
    }, [progressMap, detailedProgressMap]);

    const value = useMemo(() => ({
        progressMap,
        detailedProgressMap,
        loadingDetails,
        updateProgress,
        getProgress,
        loadDetail,
        isLoaded
    }), [progressMap, detailedProgressMap, loadingDetails, updateProgress, getProgress, loadDetail, isLoaded]);

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
