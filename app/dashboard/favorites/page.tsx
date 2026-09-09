'use client';

import { useRouter } from 'next/navigation';
import { Bookmark, Trash2 } from 'lucide-react';
import { useFavorites, type FavoriteItem } from '@/app/context/FavoritesContext';
import { useT } from '@/app/context/I18nContext';
import CardGrid from '@/components/CardGrid';
import SectionHeader from '@/components/ui/SectionHeader';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import Poster from '@/components/ui/Poster';

const SKELETON_COUNT = 6;

function buildHref(item: FavoriteItem): string {
    return `/dashboard/watch/${item.type}/${item.id}`;
}

interface FavoritesSectionProps {
    title: string;
    items: FavoriteItem[];
    emptyMessage: string;
    onRemove: (item: FavoriteItem) => void;
}

function FavoritesSection({ title, items, emptyMessage, onRemove }: FavoritesSectionProps) {
    const t = useT();
    return (
        <div className="space-y-3">
            <SectionHeader title={title} count={items.length} />
            {items.length === 0 ? (
                <EmptyState compact title={emptyMessage} />
            ) : (
                <CardGrid base={2} sm={3} md={4} lg={5} xl={6} gap={6}>
                    {items.map((item) => (
                        <div key={`${item.type}-${item.id}`}>
                            <Poster
                                href={buildHref(item)}
                                title={item.name}
                                image={item.image}
                                ratio={item.type === 'live' ? 'square' : 'poster'}
                                rating={item.rating}
                            />
                            {/* Remove control sits below the poster next to its title,
                                never overlapping the image — the old hover-only overlay
                                was unreachable by D-pad (D5). */}
                            <div className="mt-1 flex justify-end">
                                <IconButton
                                    icon={Trash2}
                                    label={t('favorites.removeFromList')}
                                    size="sm"
                                    onClick={() => onRemove(item)}
                                />
                            </div>
                        </div>
                    ))}
                </CardGrid>
            )}
        </div>
    );
}

export default function FavoritesPage() {
    const router = useRouter();
    const t = useT();
    const { favorites, removeFavorite, isLoaded } = useFavorites();

    const liveItems = favorites.filter((f) => f.type === 'live');
    const movieItems = favorites.filter((f) => f.type === 'movie');
    const seriesItems = favorites.filter((f) => f.type === 'series');

    const handleRemove = (item: FavoriteItem) => removeFavorite(item.id, item.type);

    return (
        <div className="p-4 md:p-6 lg:p-10 space-y-10">
            <div>
                <h1 className="text-2xl md:text-3xl font-semibold text-ink tracking-tight">{t('favorites.title')}</h1>
                <p className="text-ink-2 text-sm md:text-base mt-1">{t('favorites.subtitle')}</p>
            </div>

            {!isLoaded ? (
                <CardGrid base={2} sm={3} md={4} lg={5} xl={6} gap={6}>
                    {Array.from({ length: SKELETON_COUNT }, (_, index) => (
                        <div key={index} className="ratio ratio-poster rounded-xl overflow-hidden">
                            <Skeleton className="ratio-fill" />
                        </div>
                    ))}
                </CardGrid>
            ) : favorites.length === 0 ? (
                <EmptyState
                    icon={Bookmark}
                    title={t('favorites.emptyTitle')}
                    description={t('favorites.emptyDescription')}
                    action={<Button onClick={() => router.push('/dashboard/search')}>{t('favorites.browseCatalog')}</Button>}
                />
            ) : (
                <>
                    <FavoritesSection
                        title={t('favorites.liveSection')}
                        items={liveItems}
                        emptyMessage={t('favorites.noChannels')}
                        onRemove={handleRemove}
                    />
                    <FavoritesSection
                        title={t('favorites.moviesSection')}
                        items={movieItems}
                        emptyMessage={t('favorites.noMovies')}
                        onRemove={handleRemove}
                    />
                    <FavoritesSection
                        title={t('favorites.seriesSection')}
                        items={seriesItems}
                        emptyMessage={t('favorites.noSeries')}
                        onRemove={handleRemove}
                    />
                </>
            )}
        </div>
    );
}
