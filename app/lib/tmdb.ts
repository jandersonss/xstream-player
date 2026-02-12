// TMDb API helper functions and utilities

export interface TMDbMovie {
    id: number;
    title: string;
    poster_path: string | null;
    backdrop_path: string | null;
    overview: string;
    release_date: string;
    vote_average: number;
    genre_ids: number[];
}

export interface TMDbTVShow {
    id: number;
    name: string;
    poster_path: string | null;
    backdrop_path: string | null;
    overview: string;
    first_air_date: string;
    vote_average: number;
    genre_ids: number[];
}

export interface TMDbGenre {
    id: number;
    name: string;
}

export interface TMDbVideo {
    id: string;
    iso_639_1: string;
    iso_3166_1: string;
    key: string;
    name: string;
    site: string;
    size: number;
    type: string;
    official: boolean;
    published_at: string;
}

export interface CarouselConfig {
    id: string;
    title: string;
    type: 'movie' | 'tv' | 'trending';
    genreId?: number;
    year?: number;
}

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

export const getTMDbImageUrl = (path: string | null): string => {
    if (!path) return 'https://via.placeholder.com/300x450?text=Sem+Poster';
    return `${TMDB_IMAGE_BASE}${path}`;
};

/**
 * Generate a daily seed based on the current date
 * This ensures the same carousels are shown throughout the day
 */
export const getDailySeed = (): number => {
    const now = new Date();
    const dateString = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    // Simple hash function for the date string
    let hash = 0;
    for (let i = 0; i < dateString.length; i++) {
        const char = dateString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
};

/**
 * Seeded random number generator
 */
export const seededRandom = (seed: number): number => {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
};

/**
 * Shuffle array using seeded random
 */
export const shuffleWithSeed = <T>(array: T[], seed: number): T[] => {
    const shuffled = [...array];
    let currentSeed = seed;

    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom(currentSeed++) * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
};

/**
 * Generate carousel configurations for the day
 * @param movieGenres - Available movie genres
 * @param tvGenres - Available TV genres
 * @param maxCarousels - Maximum number of carousels to generate (excluding Continue Watching)
 */
export const generateDailyCarousels = (
    movieGenres: TMDbGenre[],
    tvGenres: TMDbGenre[],
    maxCarousels: number = 4
): CarouselConfig[] => {
    const seed = getDailySeed();
    const currentYear = new Date().getFullYear();

    // Always include these carousels
    const fixedCarousels: CarouselConfig[] = [
        {
            id: 'new-releases',
            title: 'Lançamentos Recentes',
            type: 'movie',
            year: currentYear
        },
        {
            id: 'trending',
            title: 'Em Alta Hoje',
            type: 'trending'
        }
    ];

    // Create pool of genre-based carousels
    const genreCarousels: CarouselConfig[] = [
        ...movieGenres.map(genre => ({
            id: `movie-genre-${genre.id}`,
            title: `Filmes de ${genre.name}`,
            type: 'movie' as const,
            genreId: genre.id
        })),
        ...tvGenres.map(genre => ({
            id: `tv-genre-${genre.id}`,
            title: `Séries de ${genre.name}`,
            type: 'tv' as const,
            genreId: genre.id
        }))
    ];

    // Shuffle genre carousels with daily seed
    const shuffledGenres = shuffleWithSeed(genreCarousels, seed);

    // Take enough genre carousels to fill remaining slots
    const remainingSlots = maxCarousels - fixedCarousels.length;
    const selectedGenres = shuffledGenres.slice(0, Math.max(0, remainingSlots));

    return [...fixedCarousels, ...selectedGenres];
};

/**
 * Generate cache key for TMDb API calls
 */
export const generateCacheKey = (endpoint: string, params: Record<string, any>): string => {
    const sortedParams = Object.keys(params)
        .sort()
        .map(key => `${key}=${params[key]}`)
        .join('&');
    return `tmdb:${endpoint}:${sortedParams}`;
};

/**
 * Normalize title for matching
 * Removes special characters, years, quality indicators, articles, etc.
 */
export const normalizeTitle = (title: string): string => {
    return title
        .toLowerCase()
        // Remove common prefixes/articles in multiple languages
        .replace(/^(the|a|an|o|os|as|um|uma|el|la|los|las|le|les|un|une|des|der|die|das)\s+/i, '')
        // Remove years like (2024) or 2024
        .replace(/\s*\(?\d{4}\)?/g, '')
        // Remove tags like [BLURAY], [HD], etc.
        .replace(/\s*\[.*?\]/g, '')
        // Remove parentheses content
        .replace(/\s*\(.*?\)/g, '')
        // Remove quality indicators and source tags
        .replace(/\s*(720p|1080p|2160p|4k|hd|bluray|brrip|webrip|web-dl|hdtv|dvdrip|cam|ts|tc).*$/i, '')
        // Remove special characters but keep accents and spaces
        .replace(/[^\w\sáàâãéèêíïóôõöúçñ]/gi, '')
        // Normalize multiple spaces
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Calculate Levenshtein distance between two strings
 */
const levenshteinDistance = (str1: string, str2: string): number => {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    return matrix[str2.length][str1.length];
};

/**
 * Calculate similarity score between two strings (0-1)
 * Uses Levenshtein distance
 */
const calculateSimilarity = (str1: string, str2: string): number => {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
};

/**
 * Check if two titles match (improved fuzzy matching)
 * @param title1 - First title to compare
 * @param title2 - Second title to compare
 * @param threshold - Similarity threshold (0-1), default 0.85
 */
export const titlesMatch = (title1: string, title2: string, threshold: number = 0.85): boolean => {
    const normalized1 = normalizeTitle(title1);
    const normalized2 = normalizeTitle(title2);

    // Exact match
    if (normalized1 === normalized2) return true;

    // Calculate similarity
    const similarity = calculateSimilarity(normalized1, normalized2);

    return similarity >= threshold;
};

/**
 * Interface for pre-calculated normalized items
 */
export interface PreparedItem<T> {
    normalizedName: string;
    original: T;
}

/**
 * Pre-calculate normalized titles for a list of items
 * Call this ONCE before running multiple matches
 */
export const prepareForMatching = <T extends { name: string }>(items: T[]): PreparedItem<T>[] => {
    return items.map(item => ({
        normalizedName: normalizeTitle(item.name),
        original: item
    }));
};

/**
 * Find the best match for a title in a list of items
 * optimized to use pre-normalized items if provided
 */
export const findBestMatch = <T extends { name: string }>(
    targetTitle: string,
    items: T[] | PreparedItem<T>[],
    threshold: number = 0.85
): { item: T; score: number } | null => {
    let bestMatch: T | null = null;
    let bestScore = 0;
    const normalizedTarget = normalizeTitle(targetTitle);

    // Detect if items are prepared or raw
    const isPrepared = items.length > 0 && 'normalizedName' in items[0];

    for (const entry of items) {
        let normalizedItem: string;
        let originalItem: T;

        if (isPrepared) {
            const p = entry as PreparedItem<T>;
            normalizedItem = p.normalizedName;
            originalItem = p.original;
        } else {
            // Slow path: normalize on the fly
            const raw = entry as T;
            normalizedItem = normalizeTitle(raw.name);
            originalItem = raw;
        }

        // Exact match optimization
        if (normalizedTarget === normalizedItem) {
            return { item: originalItem, score: 1.0 };
        }

        // Only calculate Levenshtein if lengths are somewhat similar (optimization)
        if (Math.abs(normalizedTarget.length - normalizedItem.length) > 5) {
            continue;
        }

        const similarity = calculateSimilarity(normalizedTarget, normalizedItem);

        if (similarity > bestScore) {
            bestScore = similarity;
            bestMatch = originalItem;
        }
    }

    if (bestScore >= threshold && bestMatch) {
        // Debug log for non-exact matches to help tuning
        if (bestScore < 1.0) {
            console.log(`Match found: "${targetTitle}" -> "${bestMatch.name}" (Score: ${bestScore.toFixed(2)})`);
        }
        return { item: bestMatch, score: bestScore };
    }

    return null;
};
