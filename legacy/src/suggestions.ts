import {
    CarouselConfig,
    TMDbGenre,
    TMDbMovie,
    TMDbTVShow,
    findBestMatch,
    generateDailyCarousels,
    getTMDbImageUrl,
} from './tmdb';

export interface IptvStream {
    stream_id?: number | string;
    series_id?: number | string;
    name?: string;
    title?: string;
    stream_icon?: string;
    cover?: string;
}

export interface SuggestionItem {
    id: string;
    name: string;
    image: string;
    type: 'movie' | 'series';
    rating?: string;
    year?: number;
}

export interface SuggestionCarousel {
    id: string;
    title: string;
    items: SuggestionItem[];
}

type RequestFn = <T>(url: string, method: string, body?: unknown, timeoutMs?: number) => Promise<T>;

interface MatchableStream {
    item: IptvStream;
    name: string;
    type: 'movie' | 'series';
    id: string;
}

function iptvName(item: IptvStream) {
    return item.name || item.title || '';
}

function toMatchableStreams(items: IptvStream[], type: 'movie' | 'series'): MatchableStream[] {
    const result: MatchableStream[] = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const name = iptvName(item);
        const id = String(type === 'series' ? item.series_id : item.stream_id);

        if (!name || !id || id === 'undefined') continue;

        result.push({ item, name, type, id });
    }

    return result;
}

function tmdbRequest<T>(
    requestJson: RequestFn,
    apiKey: string,
    endpoint: string,
    params: Record<string, string | number> = {}
): Promise<T | null> {
    return requestJson<T>('/api/tmdb', 'POST', {
        apiKey,
        endpoint,
        params,
    }, 25000).catch(() => null);
}

async function fetchTmdbItemsForCarousel(
    requestJson: RequestFn,
    apiKey: string,
    carousel: CarouselConfig
): Promise<(TMDbMovie | TMDbTVShow)[]> {
    if (carousel.type === 'trending') {
        const data = await tmdbRequest<{ results: (TMDbMovie | TMDbTVShow)[] }>(
            requestJson,
            apiKey,
            '/trending/all/day',
            { page: 1 }
        );
        return data && data.results ? data.results : [];
    }

    if (carousel.type === 'movie') {
        const params: Record<string, string | number> = { sort_by: 'popularity.desc', page: 1 };
        if (carousel.year) params.primary_release_year = carousel.year;
        if (carousel.genreId) params.with_genres = carousel.genreId;

        const data = await tmdbRequest<{ results: TMDbMovie[] }>(requestJson, apiKey, '/discover/movie', params);
        return data && data.results ? data.results : [];
    }

    if (carousel.type === 'tv' && carousel.genreId) {
        const data = await tmdbRequest<{ results: TMDbTVShow[] }>(requestJson, apiKey, '/discover/tv', {
            with_genres: carousel.genreId,
            sort_by: 'popularity.desc',
            page: 1,
        });
        return data && data.results ? data.results : [];
    }

    return [];
}

function matchCarouselItems(
    tmdbItems: (TMDbMovie | TMDbTVShow)[],
    carousel: CarouselConfig,
    movies: MatchableStream[],
    series: MatchableStream[]
): SuggestionItem[] {
    const matched: SuggestionItem[] = [];
    const matchedIds: Record<string, boolean> = {};

    for (let i = 0; i < tmdbItems.length; i++) {
        const tmdbItem = tmdbItems[i];
        const isMovie = 'title' in tmdbItem;
        let targetType: 'movie' | 'series' = isMovie ? 'movie' : 'series';

        if (carousel.type === 'trending') {
            if (!('title' in tmdbItem) && !('name' in tmdbItem)) continue;
            targetType = isMovie ? 'movie' : 'series';
        } else if (carousel.type === 'movie') {
            targetType = 'movie';
        } else {
            targetType = 'series';
        }

        const database = targetType === 'movie' ? movies : series;
        const tmdbTitle = isMovie ? (tmdbItem as TMDbMovie).title : (tmdbItem as TMDbTVShow).name;
        const match = findBestMatch(tmdbTitle, database, 0.85);

        if (!match || matchedIds[match.item.id]) continue;

        matchedIds[match.item.id] = true;
        matched.push({
            id: match.item.id,
            name: match.item.name,
            image: getTMDbImageUrl(tmdbItem.poster_path) || match.item.item.stream_icon || match.item.item.cover || '',
            type: targetType,
            rating: tmdbItem.vote_average ? tmdbItem.vote_average.toFixed(1) : undefined,
            year: isMovie
                ? new Date((tmdbItem as TMDbMovie).release_date || '').getFullYear()
                : new Date((tmdbItem as TMDbTVShow).first_air_date || '').getFullYear(),
        });

        if (matched.length >= 16) break;
    }

    return matched;
}

export async function fetchTmdbSuggestions(
    requestJson: RequestFn,
    apiKey: string,
    movies: IptvStream[],
    series: IptvStream[]
): Promise<SuggestionCarousel[]> {
    const matchableMovies = toMatchableStreams(movies, 'movie');
    const matchableSeries = toMatchableStreams(series, 'series');

    const [movieGenresData, tvGenresData] = await Promise.all([
        tmdbRequest<{ genres: TMDbGenre[] }>(requestJson, apiKey, '/genre/movie/list'),
        tmdbRequest<{ genres: TMDbGenre[] }>(requestJson, apiKey, '/genre/tv/list'),
    ]);

    const movieGenres = movieGenresData && movieGenresData.genres ? movieGenresData.genres : [];
    const tvGenres = tvGenresData && tvGenresData.genres ? tvGenresData.genres : [];
    const carouselConfigs = generateDailyCarousels(movieGenres, tvGenres, 4);

    const results: SuggestionCarousel[] = [];

    for (let c = 0; c < carouselConfigs.length; c++) {
        const config = carouselConfigs[c];
        const tmdbItems = await fetchTmdbItemsForCarousel(requestJson, apiKey, config);
        const items = matchCarouselItems(tmdbItems, config, matchableMovies, matchableSeries);

        if (items.length > 0) {
            results.push({
                id: config.id,
                title: config.title,
                items,
            });
        }
    }

    return results;
}
