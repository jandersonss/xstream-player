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

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export const getTMDbImageUrl = (path: string | null, size: string = 'w500'): string => {
    if (!path) return 'https://via.placeholder.com/300x450?text=Sem+Poster';
    return `${TMDB_IMAGE_BASE}/${size}${path}`;
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
 * In-memory cache for normalized titles to avoid re-computing
 * during the same session. This is especially important for
 * findBestMatch which may normalize the same title many times.
 */
const normalizationCache = new Map<string, string>();

/**
 * Normalize title for matching
 * Removes special characters, years, quality indicators, articles, etc.
 * Uses in-memory cache to avoid repeated regex computation.
 */
export const normalizeTitle = (title: string): string => {
    if (!title) return '';

    const cached = normalizationCache.get(title);
    if (cached !== undefined) return cached;

    const result = title
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

    // Cap cache size to prevent memory leaks on very long sessions
    if (normalizationCache.size > 50000) {
        normalizationCache.clear();
    }
    normalizationCache.set(title, result);

    return result;
};

/**
 * Strip provider noise ("(2019)", "[L]", "[4K]", quality tags) from a title so it
 * can be sent to TMDb's search endpoint. Unlike normalizeTitle this keeps case,
 * accents and leading articles, which TMDb's own search relies on.
 */
export const cleanSearchQuery = (title: string): string => {
    if (!title) return '';

    // A trailing bare year is deliberately kept: in this catalog it belongs to the
    // title ("Mr. Olympia 2025") rather than marking the release ("Obsessão - 2018").
    const cleaned = title
        .replace(/\s*\[.*?\]/g, '')
        .replace(/\s*\(.*?\)/g, '')
        .replace(/\s*-\s*(?:19|20)\d{2}\b/g, '')
        .replace(/\s*\b(720p|1080p|2160p|4k|hd|bluray|brrip|webrip|web-dl|hdtv|dvdrip|cam)\b.*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (cleaned) return cleaned;

    // The title was entirely bracketed ("[REC] (2007)") — keep the bracket's text.
    return title
        .replace(/\s*\(.*?\)/g, '')
        .replace(/[[\]]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
};

const yearCache = new Map<string, number | null>();

/**
 * Extract a release year from a raw title such as "Obsessão (2019) [L]".
 * A parenthesized year wins; otherwise the last plausible year-looking number
 * is used, so titles that contain numbers ("Blade Runner 2049") are not read
 * as their own release year.
 */
export const extractYear = (title: string): number | null => {
    if (!title) return null;

    const cached = yearCache.get(title);
    if (cached !== undefined) return cached;

    const maxYear = new Date().getFullYear() + 2;
    const isPlausible = (year: number) => year >= 1900 && year <= maxYear;

    let result: number | null = null;

    const parenthesized = title.match(/\((\d{4})\)/);
    if (parenthesized && isPlausible(Number(parenthesized[1]))) {
        result = Number(parenthesized[1]);
    } else {
        const bare = title.match(/(?:19|20)\d{2}/g);
        if (bare) {
            const last = Number(bare[bare.length - 1]);
            if (isPlausible(last)) result = last;
        }
    }

    if (yearCache.size > 50000) {
        yearCache.clear();
    }
    yearCache.set(title, result);

    return result;
};

const ROMAN_NUMERALS: Record<string, number> = {
    i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10
};

/**
 * Sequel number at the end of an already-normalized title
 * ("todo mundo em pânico 2" -> 2). Sequels share the whole base title, so edit
 * distance alone cannot separate them: "... pânico 2" vs "... pânico 6" scores
 * ~0.95. Comparing this token rules them out explicitly.
 */
const extractSequelNumber = (normalizedTitle: string): number | null => {
    const lastWord = normalizedTitle.split(' ').pop() || '';
    if (/^\d{1,2}$/.test(lastWord)) return parseInt(lastWord, 10);
    return ROMAN_NUMERALS[lastWord] ?? null;
};

// Regional releases make the provider's year drift from TMDb's by a year.
const YEAR_TOLERANCE = 1;

/**
 * Calculate Levenshtein distance between two strings.
 * Uses bounded computation — bails out early if distance exceeds maxDist.
 * This avoids wasted CPU on strings that clearly won't match.
 */
const levenshteinDistance = (str1: string, str2: string, maxDist?: number): number => {
    const len1 = str1.length;
    const len2 = str2.length;

    // Quick length-based bailout
    if (maxDist !== undefined && Math.abs(len1 - len2) > maxDist) {
        return maxDist + 1;
    }

    // Use single-row optimization instead of full matrix (O(n) space vs O(n*m))
    let prevRow: number[] = [];
    for (let j = 0; j <= len1; j++) {
        prevRow[j] = j;
    }

    for (let i = 1; i <= len2; i++) {
        let prev = i;
        let minInRow = prev;

        for (let j = 1; j <= len1; j++) {
            let current: number;
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                current = prevRow[j - 1];
            } else {
                current = Math.min(
                    prevRow[j - 1] + 1,
                    prev + 1,
                    prevRow[j] + 1
                );
            }

            prevRow[j - 1] = prev;
            prev = current;

            if (current < minInRow) {
                minInRow = current;
            }
        }

        prevRow[len1] = prev;

        // Early termination: if min value in this row exceeds maxDist,
        // the result will only get worse
        if (maxDist !== undefined && minInRow > maxDist) {
            return maxDist + 1;
        }
    }

    return prevRow[len1];
};

/**
 * Calculate similarity score between two strings (0-1)
 * Uses bounded Levenshtein distance for efficiency
 */
const calculateSimilarity = (str1: string, str2: string, threshold?: number): number => {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    // Calculate max allowed distance from threshold
    const maxDist = threshold !== undefined
        ? Math.floor(longer.length * (1 - threshold))
        : undefined;

    const editDistance = levenshteinDistance(longer, shorter, maxDist);

    // If bounded computation bailed out, return 0
    if (maxDist !== undefined && editDistance > maxDist) {
        return 0;
    }

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

    // Calculate similarity with bounded computation
    const similarity = calculateSimilarity(normalized1, normalized2, threshold);

    return similarity >= threshold;
};



/**
 * Find the best match for a title in a list of items.
 *
 * Title similarity alone produces false positives, because normalization strips
 * exactly the parts that disambiguate a title: a remake shares its name with the
 * original ("Obsessão" 2026 vs "Obsessão (2019)") and a sequel shares its whole
 * base title ("Todo Mundo em Pânico 6" vs "Todo Mundo em Pânico 2"). Year and
 * sequel number are therefore hard filters, applied before the similarity score
 * — including before the exact-title shortcut.
 *
 * @param targetYear - Release year of the title being looked up. When it and the
 * candidate's year are both known, they must agree within YEAR_TOLERANCE. Pass
 * null/undefined when unknown: the check is then skipped rather than guessed.
 */
export const findBestMatch = <T extends { name: string; normalized_name?: string }>(
    targetTitle: string,
    items: T[],
    threshold: number = 0.85,
    targetYear?: number | null
): { item: T; score: number } | null => {
    let bestMatch: T | null = null;
    let bestScore = 0;
    const normalizedTarget = normalizeTitle(targetTitle);

    if (!normalizedTarget) return null;

    const targetSequel = extractSequelNumber(normalizedTarget);

    // Exact title whose year only falls within the tolerance. Kept aside so an
    // exact-year candidate later in the list still wins over it.
    let driftedExact: T | null = null;

    for (const entry of items) {
        const normalizedItem = entry.normalized_name || normalizeTitle(entry.name);

        // A sequel is a different film, even when the base titles are identical.
        if (extractSequelNumber(normalizedItem) !== targetSequel) {
            continue;
        }

        const itemYear = targetYear ? extractYear(entry.name) : null;

        // Same title, different year — a remake, not this film.
        if (targetYear && itemYear && Math.abs(itemYear - targetYear) > YEAR_TOLERANCE) {
            continue;
        }

        if (normalizedTarget === normalizedItem) {
            // Exact title and exact year (or no year to check) — nothing can beat it.
            if (!targetYear || !itemYear || itemYear === targetYear) {
                return { item: entry, score: 1.0 };
            }
            if (!driftedExact) driftedExact = entry;
            continue;
        }

        // Aggressive length diff filter — skip if lengths differ too much
        // For threshold 0.85, max allowed diff is ~15% of longer string
        const maxLenDiff = Math.max(3, Math.floor(Math.max(normalizedTarget.length, normalizedItem.length) * 0.15));
        if (Math.abs(normalizedTarget.length - normalizedItem.length) > maxLenDiff) {
            continue;
        }

        const similarity = calculateSimilarity(normalizedTarget, normalizedItem, threshold);

        if (similarity > bestScore) {
            bestScore = similarity;
            bestMatch = entry;
        }
    }

    // No exact-year candidate showed up: an exact title within the year tolerance
    // still beats any fuzzy match.
    if (driftedExact) {
        return { item: driftedExact, score: 1.0 };
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
