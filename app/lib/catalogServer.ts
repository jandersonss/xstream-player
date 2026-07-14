import 'server-only';

import { promises as fs } from 'fs';
import path from 'path';
import * as library from './sqliteCache';
import {
    getTMDbImageUrl,
    getDailySeed,
    shuffleWithSeed,
    generateDailyCarousels,
    findBestMatch,
    extractYear,
    TMDbMovie,
    TMDbTVShow,
    TMDbGenre,
    generateCacheKey
} from './tmdb';
import type { CachedStream } from './dbTypes';

const CONFIG_FILE = path.join(process.cwd(), 'data', 'tmdb-config.json');
const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours
// Bump when the cached carousel/hero item shape or image sizes change, so a
// same-day cache written by an older build is not served to a newer client.
// v3: stricter matching — v2 caches hold wrong-year/wrong-sequel matches.
const CACHE_VERSION = 'v3';

async function getApiKey(): Promise<string | null> {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf-8');
        const config = JSON.parse(data);
        return config.apiKey || null;
    } catch {
        return null;
    }
}

const getYear = (dateStr: string) => {
    if (!dateStr) return new Date().getFullYear();
    const yr = new Date(dateStr).getFullYear();
    return isNaN(yr) ? new Date().getFullYear() : yr;
};

async function fetchWithCache<T>(
    apiKey: string,
    endpoint: string,
    params: Record<string, any> = {}
): Promise<T | null> {
    const cacheKey = generateCacheKey(endpoint, params);

    // Try cache first
    try {
        const cached = library.getTMDbCache(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.data as T;
        }
    } catch (err) {
        console.warn('[catalogServer] Failed to read TMDb cache:', err);
    }

    // Call API
    try {
        const queryParams = new URLSearchParams({
            api_key: apiKey,
            language: 'pt-BR',
            ...params
        });
        const urlString = `${TMDB_API_BASE}${endpoint}?${queryParams.toString()}`;
        console.log(`[catalogServer] Fetching from TMDB: ${TMDB_API_BASE}${endpoint}`);
        const response = await fetch(urlString);
        if (!response.ok) {
            console.error(`[catalogServer] TMDB Error ${response.status} for ${endpoint}`);
            // Return expired cached if available
            try {
                const cached = library.getTMDbCache(cacheKey);
                return (cached?.data as T) || null;
            } catch {
                return null;
            }
        }

        const data = await response.json();
        try {
            library.saveTMDbCache(cacheKey, data);
        } catch (err) {
            console.error('[catalogServer] Failed to write TMDb cache:', err);
        }
        return data as T;
    } catch (error) {
        console.error(`[catalogServer] TMDB fetch error for ${endpoint}:`, error);
        try {
            const cached = library.getTMDbCache(cacheKey);
            return (cached?.data as T) || null;
        } catch {
            return null;
        }
    }
}

async function fetchMovieGenres(apiKey: string): Promise<TMDbGenre[]> {
    const data = await fetchWithCache<{ genres: TMDbGenre[] }>(apiKey, '/genre/movie/list');
    return data?.genres || [];
}

async function fetchTVGenres(apiKey: string): Promise<TMDbGenre[]> {
    const data = await fetchWithCache<{ genres: TMDbGenre[] }>(apiKey, '/genre/tv/list');
    return data?.genres || [];
}

async function fetchTrending(apiKey: string, page = 1): Promise<(TMDbMovie | TMDbTVShow)[]> {
    const data = await fetchWithCache<{ results: (TMDbMovie | TMDbTVShow)[] }>(apiKey, '/trending/all/day', { page });
    return data?.results || [];
}

async function fetchMoviesByYear(apiKey: string, year: number, page = 1): Promise<TMDbMovie[]> {
    const data = await fetchWithCache<{ results: TMDbMovie[] }>(apiKey, '/discover/movie', {
        primary_release_year: year,
        sort_by: 'popularity.desc',
        page
    });
    return data?.results || [];
}

async function fetchMoviesByGenre(apiKey: string, genreId: number, page = 1): Promise<TMDbMovie[]> {
    const data = await fetchWithCache<{ results: TMDbMovie[] }>(apiKey, '/discover/movie', {
        with_genres: genreId,
        sort_by: 'popularity.desc',
        page
    });
    return data?.results || [];
}

async function fetchTVByGenre(apiKey: string, genreId: number, page = 1): Promise<TMDbTVShow[]> {
    const data = await fetchWithCache<{ results: TMDbTVShow[] }>(apiKey, '/discover/tv', {
        with_genres: genreId,
        sort_by: 'popularity.desc',
        page
    });
    return data?.results || [];
}

async function fetchVideos(apiKey: string, type: 'movie' | 'tv' | 'series', id: number): Promise<any[]> {
    const _type = type === 'series' ? 'tv' : type;
    const endpoint = `/${_type}/${id}/videos`;
    try {
        const data = await fetchWithCache<{ results: any[] }>(apiKey, endpoint);
        return data?.results || [];
    } catch {
        return [];
    }
}

export async function getIPTVCarousels(): Promise<any[]> {
    try {
        const movieCategories = library.getCategories('movie');
        const seriesCategories = library.getCategories('series');

        const seed = getDailySeed();
        const allCategories = [
            ...movieCategories.map(cat => ({ type: 'movie' as const, category: cat })),
            ...seriesCategories.map(cat => ({ type: 'series' as const, category: cat }))
        ];

        const shuffled = shuffleWithSeed(allCategories, seed);
        const selected = shuffled.slice(0, 4);

        const results = selected.map(({ type, category }) => {
            const categoryStreams = library.getStreams(category.category_id, type);
            return {
                id: `${type}-${category.category_id}`,
                title: category.category_name,
                type,
                data: categoryStreams.slice(0, 20).map(stream => ({
                    id: stream.id,
                    name: stream.name,
                    image: stream.icon || 'https://via.placeholder.com/300x450?text=Sem+Poster',
                    rating: stream.rating,
                    year: undefined,
                    type: stream.type
                })),
                categoryId: category.category_id
            };
        });

        return results.filter(r => r.data.length > 0);
    } catch (err) {
        console.error('[catalogServer] Failed to get IPTV carousels:', err);
        return [];
    }
}

export async function getTMDbCarousels(apiKey: string): Promise<any[]> {
    const today = new Date();
    const dayStamp = today.toISOString().split('T')[0];
    const dateKey = `${CACHE_VERSION}-${dayStamp}`;

    // Check cache first
    try {
        const cachedData = library.getCarouselCache(dateKey);
        if (cachedData && cachedData.length > 0) {
            console.log('[catalogServer] Using cached carousels for', dateKey);
            // Clean up old caches in background. The pattern must keep today's
            // hero entries too — they live in the same table.
            try {
                library.clearExpiredCarouselCache(`${CACHE_VERSION}-%${dayStamp}`);
            } catch (err) {
                console.error('[catalogServer] Failed to clear expired carousel cache:', err);
            }
            return cachedData;
        }
    } catch (error) {
        console.warn('[catalogServer] Failed to read carousel cache:', error);
    }

    try {
        const allMovies = library.getAllStreams('movie');
        const allSeries = library.getAllStreams('series');

        const [movieGenres, tvGenres] = await Promise.all([
            fetchMovieGenres(apiKey),
            fetchTVGenres(apiKey)
        ]);

        const carousels = generateDailyCarousels(movieGenres, tvGenres, 4);

        const results = await Promise.all(
            carousels.map(async (carousel) => {
                let tmdbItems: (TMDbMovie | TMDbTVShow)[] = [];

                try {
                    if (carousel.type === 'trending') {
                        tmdbItems = await fetchTrending(apiKey);
                    } else if (carousel.type === 'movie') {
                        if (carousel.year) {
                            tmdbItems = await fetchMoviesByYear(apiKey, carousel.year);
                        } else if (carousel.genreId) {
                            tmdbItems = await fetchMoviesByGenre(apiKey, carousel.genreId);
                        }
                    } else if (carousel.type === 'tv' && carousel.genreId) {
                        tmdbItems = await fetchTVByGenre(apiKey, carousel.genreId);
                    }
                } catch (error) {
                    console.error(`[catalogServer] Failed to fetch TMDb data for ${carousel.id}:`, error);
                    return {
                        id: carousel.id,
                        title: carousel.title,
                        type: carousel.type === 'tv' ? ('series' as const) : ('movie' as const),
                        data: [] as any[]
                    };
                }

                const filteredItems: any[] = [];
                const matchedStreamIds = new Set<number | string>();

                for (const tmdbItem of tmdbItems) {
                    let isMovie = false;
                    if (carousel.type === 'trending') {
                        isMovie = 'title' in tmdbItem;
                    } else {
                        isMovie = carousel.type === 'movie';
                    }

                    if (!('title' in tmdbItem) && !('name' in tmdbItem)) continue;

                    const targetDatabase = isMovie ? allMovies : allSeries;
                    const tmdbTitle = isMovie ? (tmdbItem as TMDbMovie).title : (tmdbItem as TMDbTVShow).name;
                    const yearStr = isMovie
                        ? (tmdbItem as TMDbMovie).release_date
                        : (tmdbItem as TMDbTVShow).first_air_date;

                    const matchResult = findBestMatch<any>(tmdbTitle, targetDatabase, 0.85, extractYear(yearStr));

                    if (matchResult && !matchedStreamIds.has(matchResult.item.id)) {
                        const iptvMatch = matchResult.item;
                        matchedStreamIds.add(iptvMatch.id);

                        const tmdbPoster = getTMDbImageUrl(tmdbItem.poster_path, 'w342');
                        const tmdbRating = tmdbItem.vote_average;
                        const tmdbYear = getYear(yearStr);

                        filteredItems.push({
                            id: iptvMatch.id,
                            name: iptvMatch.name,
                            image: tmdbPoster || iptvMatch.icon || 'https://via.placeholder.com/300x450?text=Sem+Poster',
                            rating: tmdbRating || iptvMatch.rating,
                            year: tmdbYear,
                            type: iptvMatch.type
                        });
                    }

                    if (filteredItems.length >= 20) break;
                }

                return {
                    id: carousel.id,
                    title: carousel.title,
                    type: carousel.type === 'tv' ? ('series' as const) : ('movie' as const),
                    data: filteredItems
                };
            })
        );

        const validResults = results.filter(r => r.data.length > 0);

        if (validResults.length > 0) {
            try {
                library.saveCarouselCache(dateKey, validResults);
            } catch (err) {
                console.error('[catalogServer] Failed to save carousel cache:', err);
            }
        }

        return validResults;
    } catch (err) {
        console.error('[catalogServer] Failed to process TMDb carousels:', err);
        return [];
    }
}

export async function getBackendCarousels(): Promise<any[]> {
    const apiKey = await getApiKey();
    const allCarousels: any[] = [];

    if (apiKey) {
        try {
            const tmdbCarousels = await getTMDbCarousels(apiKey);
            allCarousels.push(...tmdbCarousels);
        } catch (err) {
            console.error('[catalogServer] Failed to load TMDb carousels:', err);
        }
    }

    try {
        const iptvCarousels = await getIPTVCarousels();
        allCarousels.push(...iptvCarousels);
    } catch (err) {
        console.error('[catalogServer] Failed to load IPTV carousels:', err);
    }

    return allCarousels;
}

export async function getBackendHeroItems(type: 'all' | 'movie' | 'series' = 'all'): Promise<any[]> {
    const today = new Date();
    const dateKey = `${CACHE_VERSION}-hero-${type}-${today.toISOString().split('T')[0]}`;

    // 1. Check Cache
    try {
        const cached = library.getCarouselCache(dateKey);
        if (cached && cached.length > 0) {
            console.log('[catalogServer] HeroSection: Using cached items', cached.length);
            return cached;
        }
    } catch (e) {
        console.warn('[catalogServer] Hero cache miss');
    }

    const apiKey = await getApiKey();
    let movies: CachedStream[] = [];
    let series: CachedStream[] = [];

    try {
        if (type === 'all' || type === 'movie') {
            movies = library.getAllStreams('movie');
        }
        if (type === 'all' || type === 'series') {
            series = library.getAllStreams('series');
        }
    } catch (err) {
        console.error('[catalogServer] Failed to query streams for Hero:', err);
    }

    let potentialItems: any[] = [];

    // 2. Fetch TMDB Trending and match
    if (apiKey) {
        try {
            console.log('[catalogServer] HeroSection: Fetching TMDB Trending...');
            const trending = await fetchTrending(apiKey);
            console.log(`[catalogServer] HeroSection: Found ${trending.length} trending items. Matching...`);

            for (const item of trending) {
                const isMovie = 'title' in item;

                if (type === 'movie' && !isMovie) continue;
                if (type === 'series' && isMovie) continue;

                const title = isMovie ? (item as TMDbMovie).title : (item as TMDbTVShow).name;
                const targetDb = isMovie ? movies : series;
                const yearStr = isMovie ? (item as TMDbMovie).release_date : (item as TMDbTVShow).first_air_date;

                const match = findBestMatch<CachedStream>(title, targetDb, 0.85, extractYear(yearStr));
                const stream = match?.item;
                const hasStreamDetail = !!(
                    stream &&
                    (stream.plot ||
                        stream.cover ||
                        stream.icon ||
                        (stream.backdrop_path && stream.backdrop_path.length > 0 && stream.backdrop_path[0]))
                );

                if (match && hasStreamDetail && item.backdrop_path) {
                    // Fetch videos on the backend for trailer autoplay
                    let videoKey: string | null = null;
                    try {
                        const videos = await fetchVideos(apiKey, isMovie ? 'movie' : 'series', item.id);
                        const trailer = videos.find(v => v.site === 'YouTube' && v.type === 'Trailer' && v.official)
                            || videos.find(v => v.site === 'YouTube' && v.type === 'Trailer')
                            || videos.find(v => v.site === 'YouTube' && v.type === 'Teaser');
                        if (trailer) {
                            videoKey = trailer.key;
                        }
                    } catch (videoErr) {
                        console.error(`[catalogServer] Failed to fetch videos for hero item ${item.id}:`, videoErr);
                    }

                    potentialItems.push({
                        id: String(match.item.id),
                        tmdbId: item.id,
                        title: title,
                        description: item.overview,
                        backdrop: getTMDbImageUrl(item.backdrop_path, 'w1280'),
                        poster: getTMDbImageUrl(item.poster_path, 'w342'),
                        type: isMovie ? 'movie' : 'series',
                        rating: item.vote_average,
                        year: getYear(yearStr),
                        videoKey
                    });
                }
            }
            console.log(`[catalogServer] HeroSection: Matched ${potentialItems.length} items from TMDB.`);
        } catch (err) {
            console.error('[catalogServer] HeroSection: Error matching TMDB', err);
        }
    } else {
        console.log('[catalogServer] HeroSection: TMDB not configured.');
    }

    // 3. Fallback: If not enough items, fill with random local high-rated/recent content
    if (potentialItems.length < 5) {
        console.log('[catalogServer] HeroSection: detailed matches < 5, filling with random local content...');
        const allContent = [...movies, ...series];
        const localSeed = getDailySeed() + (type === 'movie' ? 1 : type === 'series' ? 2 : 0);
        const shuffledLocal = shuffleWithSeed(allContent, localSeed);

        for (const item of shuffledLocal) {
            if (potentialItems.length >= 5) break;

            if (potentialItems.some(pi => pi.id === String(item.id))) continue;

            const firstBackdrop = item.backdrop_path && item.backdrop_path.length > 0 ? item.backdrop_path[0] : null;
            let backdrop = firstBackdrop ? getTMDbImageUrl(firstBackdrop, 'w1280') : (item.icon || '');
            if (!backdrop || backdrop.includes('placeholder')) backdrop = item.icon || '';
            if (!backdrop) continue;

            potentialItems.push({
                id: String(item.id),
                title: item.name,
                description: item.plot || 'Sinopse indisponível.',
                backdrop: backdrop,
                poster: item.icon || '',
                type: item.type === 'series' ? 'series' : 'movie',
                rating: item.rating ? Number(item.rating) : 0,
                year: new Date().getFullYear(),
                videoKey: null
            });
        }
    }

    // Deduplicate
    const uniqueItems = Array.from(new Map(potentialItems.map(item => [item.id, item])).values());
    
    // Pick 5
    const pickSeed = getDailySeed() + (type === 'movie' ? 10 : type === 'series' ? 20 : 0);
    const shuffled = shuffleWithSeed(uniqueItems, pickSeed);
    const selected = shuffled.slice(0, 5);

    if (selected.length > 0) {
        try {
            library.saveCarouselCache(dateKey, selected);
        } catch (err) {
            console.error('[catalogServer] Failed to save hero cache:', err);
        }
    }

    return selected;
}
