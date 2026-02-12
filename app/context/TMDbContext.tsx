'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { TMDbGenre, TMDbMovie, TMDbTVShow, generateCacheKey } from '../lib/tmdb';
import * as db from '../lib/db';

interface TMDbConfig {
    apiKey: string;
}

interface TMDbContextType {
    config: TMDbConfig | null;
    isConfigured: boolean;
    isLoading: boolean;
    saveConfig: (apiKey: string) => Promise<boolean>;
    clearConfig: () => Promise<void>;
    fetchMovieGenres: () => Promise<TMDbGenre[]>;
    fetchTVGenres: () => Promise<TMDbGenre[]>;
    fetchMoviesByYear: (year: number, page?: number) => Promise<TMDbMovie[]>;
    fetchMoviesByGenre: (genreId: number, page?: number) => Promise<TMDbMovie[]>;
    fetchTVByGenre: (genreId: number, page?: number) => Promise<TMDbTVShow[]>;
    fetchTrending: (page?: number) => Promise<(TMDbMovie | TMDbTVShow)[]>;
    searchMovie: (query: string) => Promise<TMDbMovie | null>;
    searchTV: (query: string) => Promise<TMDbTVShow | null>;
    fetchVideos: (type: 'movie' | 'tv' | 'series', id: number) => Promise<any[]>;
}

const TMDbContext = createContext<TMDbContextType | undefined>(undefined);

const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

export const TMDbProvider = ({ children }: { children: ReactNode }) => {
    const [config, setConfig] = useState<TMDbConfig | null>(null);
    const [isConfigured, setIsConfigured] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Load config from backend on mount
    useEffect(() => {
        const loadConfig = async () => {
            try {
                const response = await fetch('/api/tmdb/config');
                if (response.ok) {
                    const data = await response.json();
                    if (data.apiKey) {
                        setConfig({ apiKey: data.apiKey });
                        setIsConfigured(true);
                    }
                }
            } catch (error) {
                console.error('Failed to load TMDb config:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadConfig();
    }, []);

    const saveConfig = async (apiKey: string): Promise<boolean> => {
        try {
            // Save to backend (which validates the key)
            const response = await fetch('/api/tmdb/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ apiKey }),
            });

            if (!response.ok) {
                const error = await response.json();
                console.error('Failed to save TMDb config:', error);
                return false;
            }

            const { config: newConfig } = await response.json();
            setConfig({ apiKey: newConfig.apiKey });
            setIsConfigured(true);

            return true;
        } catch (error) {
            console.error('Failed to save TMDb config:', error);
            return false;
        }
    };

    const clearConfig = async () => {
        try {
            await fetch('/api/tmdb/config', {
                method: 'DELETE',
            });
        } catch (error) {
            console.error('Failed to delete TMDb config:', error);
        }
        setConfig(null);
        setIsConfigured(false);
    };

    const fetchWithCache = useCallback(async <T,>(
        endpoint: string,
        params: Record<string, any> = {}
    ): Promise<T | null> => {
        if (!config?.apiKey) return null;

        const cacheKey = generateCacheKey(endpoint, params);

        // Try to get from cache first
        const cached = await db.getTMDbCache(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.data as T;
        }

        // Fetch from API
        try {
            const response = await fetch('/api/tmdb', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey: config.apiKey,
                    endpoint,
                    params
                })
            });

            if (!response.ok) {
                throw new Error('TMDb API request failed');
            }

            const data = await response.json();

            // Save to cache
            await db.saveTMDbCache(cacheKey, data);

            return data as T;
        } catch (error) {
            console.error('TMDb fetch error:', error);
            // Return cached data even if expired, better than nothing
            return cached?.data as T || null;
        }
    }, [config]);

    const fetchMovieGenres = useCallback(async (): Promise<TMDbGenre[]> => {
        const data = await fetchWithCache<{ genres: TMDbGenre[] }>('/genre/movie/list');
        return data?.genres || [];
    }, [fetchWithCache]);

    const fetchTVGenres = useCallback(async (): Promise<TMDbGenre[]> => {
        const data = await fetchWithCache<{ genres: TMDbGenre[] }>('/genre/tv/list');
        return data?.genres || [];
    }, [fetchWithCache]);

    const fetchMoviesByYear = useCallback(async (year: number, page: number = 1): Promise<TMDbMovie[]> => {
        const data = await fetchWithCache<{ results: TMDbMovie[] }>('/discover/movie', {
            primary_release_year: year,
            sort_by: 'popularity.desc',
            page
        });
        return data?.results || [];
    }, [fetchWithCache]);

    const fetchMoviesByGenre = useCallback(async (genreId: number, page: number = 1): Promise<TMDbMovie[]> => {
        const data = await fetchWithCache<{ results: TMDbMovie[] }>('/discover/movie', {
            with_genres: genreId,
            sort_by: 'popularity.desc',
            page
        });
        return data?.results || [];
    }, [fetchWithCache]);

    const fetchTVByGenre = useCallback(async (genreId: number, page: number = 1): Promise<TMDbTVShow[]> => {
        const data = await fetchWithCache<{ results: TMDbTVShow[] }>('/discover/tv', {
            with_genres: genreId,
            sort_by: 'popularity.desc',
            page
        });
        return data?.results || [];
    }, [fetchWithCache]);

    const fetchTrending = useCallback(async (page: number = 1): Promise<(TMDbMovie | TMDbTVShow)[]> => {
        const data = await fetchWithCache<{ results: (TMDbMovie | TMDbTVShow)[] }>('/trending/all/day', { page });
        return data?.results || [];
    }, [fetchWithCache]);

    const searchMovie = useCallback(async (query: string): Promise<TMDbMovie | null> => {
        if (!query.trim()) return null;

        const data = await fetchWithCache<{ results: TMDbMovie[] }>('/search/movie', {
            query: query.trim(),
            page: 1
        });

        // Return the first result (most relevant)
        return data?.results?.[0] || null;
    }, [fetchWithCache]);

    const searchTV = useCallback(async (query: string): Promise<TMDbTVShow | null> => {
        if (!query.trim()) return null;

        const data = await fetchWithCache<{ results: TMDbTVShow[] }>('/search/tv', {
            query: query.trim(),
            page: 1
        });

        // Return the first result (most relevant)
        return data?.results?.[0] || null;
    }, [fetchWithCache]);

    const fetchVideos = useCallback(async (type: 'movie' | 'tv' | 'series', id: number): Promise<any[]> => {
        const _type = type === 'series' ? 'tv' : type;
        const endpoint = `/${_type}/${id}/videos`;
        console.log(`[TMDbContext] Fetching videos for ${_type} ${id} at ${endpoint}`);

        try {
            const data = await fetchWithCache<{ results: any[] }>(endpoint);
            if (!data) {
                console.warn(`[TMDbContext] No data returned for video fetch: ${endpoint}`);
                return [];
            }
            console.log(`[TMDbContext] Found ${data.results?.length || 0} videos for ${id}`);
            return data.results || [];
        } catch (error) {
            console.error(`[TMDbContext] Error fetching videos for ${endpoint}:`, error);
            return [];
        }
    }, [fetchWithCache]);

    return (
        <TMDbContext.Provider value={{
            config,
            isConfigured,
            isLoading,
            saveConfig,
            clearConfig,
            fetchMovieGenres,
            fetchTVGenres,
            fetchMoviesByYear,
            fetchMoviesByGenre,
            fetchTVByGenre,
            fetchTrending,
            searchMovie,
            searchTV,
            fetchVideos
        }}>
            {children}
        </TMDbContext.Provider>
    );
};

export const useTMDb = () => {
    const context = useContext(TMDbContext);
    if (context === undefined) {
        throw new Error('useTMDb must be used within a TMDbProvider');
    }
    return context;
};
