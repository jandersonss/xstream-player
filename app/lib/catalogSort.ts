import type { CachedCategory } from './dbTypes';
import type { CatalogItem } from './catalogItem';

export type SortOption = 'name-asc' | 'name-desc' | 'added' | 'year' | 'rating';

// User-facing labels live in the i18n dictionaries under `catalog.sort.<option>`
// and are resolved by `components/SortControls.tsx`.

function compareNames(a: string, b: string): number {
    return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
}

// Providers send "0" for titles that were never rated, so a non-positive score
// counts as missing and those items sink to the end instead of mixing with low scores.
function ratingScore(rating: number | undefined): number | undefined {
    return rating !== undefined && Number.isFinite(rating) && rating > 0 ? rating : undefined;
}

function compareRatings(a: CatalogItem, b: CatalogItem): number {
    const scoreA = ratingScore(a.rating);
    const scoreB = ratingScore(b.rating);

    if (scoreA === undefined && scoreB === undefined) return compareNames(a.name, b.name);
    if (scoreA === undefined) return 1;
    if (scoreB === undefined) return -1;
    return scoreB - scoreA || compareNames(a.name, b.name);
}

export function sortCatalogItems(items: CatalogItem[], sort: SortOption): CatalogItem[] {
    const copy = [...items];

    switch (sort) {
        case 'name-asc':
            return copy.sort((a, b) => compareNames(a.name, b.name));
        case 'name-desc':
            return copy.sort((a, b) => compareNames(b.name, a.name));
        case 'added':
            return copy.sort((a, b) => b.addedAt - a.addedAt);
        case 'year':
            return copy.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
        case 'rating':
            return copy.sort(compareRatings);
        default:
            return copy;
    }
}

export function sortCategories(
    categories: CachedCategory[],
    sort: 'name-asc' | 'name-desc',
): CachedCategory[] {
    const copy = [...categories];

    return sort === 'name-desc'
        ? copy.sort((a, b) => compareNames(b.category_name, a.category_name))
        : copy.sort((a, b) => compareNames(a.category_name, b.category_name));
}
