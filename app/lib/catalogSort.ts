import type { CachedCategory } from './dbTypes';
import type { CatalogItem } from './catalogItem';

export type SortOption = 'name-asc' | 'name-desc' | 'added' | 'year';

export const SORT_LABELS: Record<SortOption, string> = {
    'name-asc': 'A-Z',
    'name-desc': 'Z-A',
    added: 'Adicionados',
    year: 'Ano',
};

function compareNames(a: string, b: string): number {
    return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
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
