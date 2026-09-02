'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { useData } from '@/app/context/DataContext';
import type { ContentType } from '@/app/lib/dbTypes';
import { toCatalogItems, type CatalogItem } from '@/app/lib/catalogItem';
import { sortCatalogItems, type SortOption } from '@/app/lib/catalogSort';
import { useSortPreference } from '@/app/hooks/useSortPreference';
import { useInfiniteScroll } from '@/app/hooks/useInfiniteScroll';
import CardGrid from '@/components/CardGrid';
import SectionHeader from '@/components/ui/SectionHeader';
import SortControls from '@/components/SortControls';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import Button from '@/components/ui/Button';
import Poster from '@/components/ui/Poster';
import Loader from '@/components/Loader';

export interface CatalogListingProps {
    type: ContentType;
    categoryId: string;
    backHref: string;
    fallbackTitle: string;
}

// Live channel logos are square; movies/series get a 2:3 poster.
const SORT_OPTIONS_BY_TYPE: Record<ContentType, SortOption[]> = {
    live: ['name-asc', 'name-desc', 'added'],
    movie: ['name-asc', 'name-desc', 'added', 'year'],
    series: ['name-asc', 'name-desc', 'added', 'year'],
};

const SKELETON_COUNT = 12;

export default function CatalogListing({ type, categoryId, backHref, fallbackTitle }: CatalogListingProps) {
    const router = useRouter();
    const { getCachedStreams, getCachedCategories } = useData();

    const [items, setItems] = useState<CatalogItem[]>([]);
    const [categoryName, setCategoryName] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [sort, setSort] = useSortPreference(type, 'added');

    const loadData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [categories, streams] = await Promise.all([
                getCachedCategories(type),
                getCachedStreams(categoryId, type),
            ]);
            const category = categories.find((c) => c.category_id === categoryId);
            setCategoryName(category?.category_name ?? '');
            setItems(toCatalogItems(streams));
        } catch {
            setError('Não foi possível carregar os itens desta categoria.');
        } finally {
            setLoading(false);
        }
    }, [categoryId, getCachedCategories, getCachedStreams, type]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const sortedItems = sortCatalogItems(items, sort);
    const { visibleItems, hasMore, sentinelRef } = useInfiniteScroll(sortedItems);

    const isLive = type === 'live';
    const gap = isLive ? 4 : 6;

    return (
        <div className="p-4 md:p-6 lg:p-10 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                <Button variant="ghost" icon={ArrowLeft} onClick={() => router.push(backHref)}>
                    Voltar
                </Button>
                <SortControls value={sort} onChange={setSort} options={SORT_OPTIONS_BY_TYPE[type]} />
            </div>

            <SectionHeader title={categoryName || fallbackTitle} count={loading ? undefined : items.length} />

            {loading ? (
                <CardGrid base={2} sm={3} md={4} lg={5} xl={6} gap={gap}>
                    {Array.from({ length: SKELETON_COUNT }, (_, index) => (
                        <div
                            key={index}
                            className={['ratio', isLive ? 'ratio-square' : 'ratio-poster', 'rounded-xl overflow-hidden'].join(' ')}
                        >
                            <Skeleton className="ratio-fill" />
                        </div>
                    ))}
                </CardGrid>
            ) : error ? (
                <EmptyState
                    icon={AlertCircle}
                    title={error}
                    action={<Button onClick={loadData}>Tentar de novo</Button>}
                />
            ) : items.length === 0 ? (
                <EmptyState title="Nenhum item nesta categoria." />
            ) : (
                <>
                    <CardGrid base={2} sm={3} md={4} lg={5} xl={6} gap={gap}>
                        {visibleItems.map((item) => (
                            <Poster
                                key={item.id}
                                href={item.href}
                                title={item.name}
                                image={item.image}
                                ratio={isLive ? 'square' : 'poster'}
                                subtitle={!isLive ? (type === 'series' ? item.releaseDate : item.year?.toString()) : undefined}
                                rating={!isLive ? item.rating : undefined}
                            />
                        ))}
                    </CardGrid>
                    {hasMore && (
                        <div ref={sentinelRef} className="h-20 flex items-center justify-center p-4">
                            <Loader size="small" />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
