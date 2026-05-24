export interface TMDbMovie {
    id: number;
    title: string;
    poster_path: string | null;
    backdrop_path: string | null;
    overview: string;
    release_date: string;
    vote_average: number;
}

export interface TMDbTVShow {
    id: number;
    name: string;
    poster_path: string | null;
    backdrop_path: string | null;
    overview: string;
    first_air_date: string;
    vote_average: number;
}

export interface TMDbGenre {
    id: number;
    name: string;
}

export interface CarouselConfig {
    id: string;
    title: string;
    type: 'movie' | 'tv' | 'trending';
    genreId?: number;
    year?: number;
}

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

export function getTMDbImageUrl(path: string | null): string {
    if (!path) return 'https://via.placeholder.com/300x450?text=Sem+Poster';
    return `${TMDB_IMAGE_BASE}${path}`;
}

export function getDailySeed(): number {
    const now = new Date();
    const dateString = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    let hash = 0;
    for (let i = 0; i < dateString.length; i++) {
        const char = dateString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

function seededRandom(seed: number): number {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

export function shuffleWithSeed<T>(array: T[], seed: number): T[] {
    const shuffled = array.slice();
    let currentSeed = seed;

    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom(currentSeed++) * (i + 1));
        const temp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = temp;
    }

    return shuffled;
}

export function generateDailyCarousels(
    movieGenres: TMDbGenre[],
    tvGenres: TMDbGenre[],
    maxCarousels: number = 4
): CarouselConfig[] {
    const seed = getDailySeed();
    const currentYear = new Date().getFullYear();

    const fixedCarousels: CarouselConfig[] = [
        { id: 'new-releases', title: 'Lancamentos Recentes', type: 'movie', year: currentYear },
        { id: 'trending', title: 'Em Alta Hoje', type: 'trending' },
    ];

    const genreCarousels: CarouselConfig[] = [
        ...movieGenres.map(genre => ({
            id: `movie-genre-${genre.id}`,
            title: `Filmes de ${genre.name}`,
            type: 'movie' as const,
            genreId: genre.id,
        })),
        ...tvGenres.map(genre => ({
            id: `tv-genre-${genre.id}`,
            title: `Series de ${genre.name}`,
            type: 'tv' as const,
            genreId: genre.id,
        })),
    ];

    const shuffledGenres = shuffleWithSeed(genreCarousels, seed);
    const remainingSlots = maxCarousels - fixedCarousels.length;
    const selectedGenres = shuffledGenres.slice(0, Math.max(0, remainingSlots));

    return fixedCarousels.concat(selectedGenres);
}

const normalizationCache: Record<string, string> = {};

export function normalizeTitle(title: string): string {
    if (!title) return '';

    if (normalizationCache[title] !== undefined) {
        return normalizationCache[title];
    }

    const result = title
        .toLowerCase()
        .replace(/^(the|a|an|o|os|as|um|uma|el|la|los|las|le|les|un|une|des|der|die|das)\s+/i, '')
        .replace(/\s*\(?\d{4}\)?/g, '')
        .replace(/\s*\[.*?\]/g, '')
        .replace(/\s*\(.*?\)/g, '')
        .replace(/\s*(720p|1080p|2160p|4k|hd|bluray|brrip|webrip|web-dl|hdtv|dvdrip|cam|ts|tc).*$/i, '')
        .replace(/[^\w\sáàâãéèêíïóôõöúçñ]/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    normalizationCache[title] = result;
    return result;
}

function levenshteinDistance(str1: string, str2: string, maxDist?: number): number {
    const len1 = str1.length;
    const len2 = str2.length;

    if (maxDist !== undefined && Math.abs(len1 - len2) > maxDist) {
        return maxDist + 1;
    }

    const prevRow: number[] = [];
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
                current = Math.min(prevRow[j - 1] + 1, prev + 1, prevRow[j] + 1);
            }

            prevRow[j - 1] = prev;
            prev = current;
            if (current < minInRow) minInRow = current;
        }

        prevRow[len1] = prev;
        if (maxDist !== undefined && minInRow > maxDist) return maxDist + 1;
    }

    return prevRow[len1];
}

function calculateSimilarity(str1: string, str2: string, threshold?: number): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    if (longer.length === 0) return 1;

    const maxDist = threshold !== undefined
        ? Math.floor(longer.length * (1 - threshold))
        : undefined;

    const editDistance = levenshteinDistance(longer, shorter, maxDist);
    if (maxDist !== undefined && editDistance > maxDist) return 0;

    return (longer.length - editDistance) / longer.length;
}

export function findBestMatch<T extends { name: string }>(
    targetTitle: string,
    items: T[],
    threshold: number = 0.85
): { item: T; score: number } | null {
    let bestMatch: T | null = null;
    let bestScore = 0;
    const normalizedTarget = normalizeTitle(targetTitle);

    if (!normalizedTarget) return null;

    for (let i = 0; i < items.length; i++) {
        const entry = items[i];
        const normalizedItem = normalizeTitle(entry.name);

        if (normalizedTarget === normalizedItem) {
            return { item: entry, score: 1 };
        }

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

    if (bestScore >= threshold && bestMatch) {
        return { item: bestMatch, score: bestScore };
    }

    return null;
}
