'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ChevronRight } from 'lucide-react';
import { useData } from '@/app/context/DataContext';
import type { CachedCategory, ContentType } from '@/app/lib/dbTypes';
import { sortCategories } from '@/app/lib/catalogSort';
import { useSortPreference } from '@/app/hooks/useSortPreference';
import CardGrid from '@/components/CardGrid';
import SectionHeader from '@/components/ui/SectionHeader';
import SortControls from '@/components/SortControls';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import Button from '@/components/ui/Button';
import HeroSection from '@/components/HeroSection';

export interface CategoryBrowserProps {
    type: ContentType;
    title: string;
    /** Top hero. Absent for 'live', like today. */
    hero?: 'movie' | 'series';
}

// Maps the content type to its route segment (`movie` -> `/dashboard/movies`).
const ROUTE_SEGMENT: Record<ContentType, string> = {
    live: 'live',
    movie: 'movies',
    series: 'series',
};

// Categories have no date or year, so only the two name-based sort options apply.
const CATEGORY_SORT_OPTIONS = ['name-asc', 'name-desc'] as const;

const SKELETON_COUNT = 12;

export default function CategoryBrowser({ type, title, hero }: CategoryBrowserProps) {
    const { getCachedCategories } = useData();
    const [categories, setCategories] = useState<CachedCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [sort, setSort] = useSortPreference('cat_' + type, 'name-asc');

    const loadCategories = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const cached = await getCachedCategories(type);
            setCategories(cached);
        } catch {
            setError('Não foi possível carregar as categorias.');
        } finally {
            setLoading(false);
        }
    }, [getCachedCategories, type]);

    useEffect(() => {
        loadCategories();
    }, [loadCategories]);

    const sortedCategories = sortCategories(categories, sort === 'name-desc' ? 'name-desc' : 'name-asc');
    const routeSegment = ROUTE_SEGMENT[type];

    return (
        <div className="w-full">
            {hero && <HeroSection type={hero} />}

            <div className="p-4 md:p-6 lg:p-10 space-y-6">
                <SectionHeader
                    title={title}
                    count={loading ? undefined : sortedCategories.length}
                    action={
                        <SortControls
                            value={sort}
                            onChange={setSort}
                            options={[...CATEGORY_SORT_OPTIONS]}
                        />
                    }
                />

                {loading ? (
                    <CardGrid base={2} md={3} lg={4} xl={5} gap={4}>
                        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
                            <Skeleton key={index} className="min-h-[104px] rounded-xl" />
                        ))}
                    </CardGrid>
                ) : error ? (
                    <EmptyState
                        icon={AlertCircle}
                        title={error}
                        action={<Button onClick={loadCategories}>Tentar de novo</Button>}
                    />
                ) : sortedCategories.length === 0 ? (
                    <EmptyState title="Nenhuma categoria disponível. Atualize o catálogo em Ajustes." />
                ) : (
                    <CardGrid base={2} md={3} lg={4} xl={5} gap={4}>
                        {sortedCategories.map((category) => (
                            <Link
                                key={category.category_id}
                                href={`/dashboard/${routeSegment}/${category.category_id}`}
                                data-focusable="true"
                                tabIndex={0}
                                className="spotlight-item flex items-center justify-between bg-surface-2 border border-line rounded-xl p-5 min-h-[104px]"
                            >
                                <span className="text-sm md:text-base font-medium text-ink line-clamp-2">
                                    {category.category_name}
                                </span>
                                <ChevronRight className="text-ink-3 flex-shrink-0 ml-2" size={20} />
                            </Link>
                        ))}
                    </CardGrid>
                )}
            </div>
        </div>
    );
}
