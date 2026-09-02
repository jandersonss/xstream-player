'use client';

import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { Search, AlertCircle, Loader as LoaderIcon } from 'lucide-react';

import { useData } from '@/app/context/DataContext';
import { useInfiniteScroll } from '@/app/hooks/useInfiniteScroll';
import { getDeviceProfile, type DeviceTier } from '@/app/lib/deviceProfile';
import { toCatalogItems, type CatalogItem } from '@/app/lib/catalogItem';
import { inputClassName } from '@/components/ui/Field';
import CardGrid from '@/components/CardGrid';
import Poster from '@/components/ui/Poster';
import EmptyState from '@/components/ui/EmptyState';
import Skeleton from '@/components/ui/Skeleton';
import Loader from '@/components/Loader';

type SearchCategory = 'all' | 'live' | 'movie' | 'series';

const MIN_QUERY_LENGTH = 2;
const SKELETON_COUNT = 12;

/**
 * Search is CPU-bound on the client, not the server (SQLite answers a folded
 * LIKE scan in a few ms). On a low-memory TV the cost is re-rendering the result
 * grid and reconciling it on every keystroke, so the tuning below trades result
 * volume and reaction speed for a responsive on-screen keyboard.
 */
const SEARCH_TUNING: Record<DeviceTier, { debounceMs: number; limit: number; initialBatch: number; loadBatch: number }> = {
    low: { debounceMs: 450, limit: 60, initialBatch: 18, loadBatch: 12 },
    medium: { debounceMs: 350, limit: 150, initialBatch: 24, loadBatch: 18 },
    high: { debounceMs: 250, limit: 300, initialBatch: 30, loadBatch: 20 },
    'ultra-high': { debounceMs: 250, limit: 300, initialBatch: 30, loadBatch: 20 },
};

const TABS: { id: SearchCategory; label: string }[] = [
    { id: 'all', label: 'Tudo' },
    { id: 'live', label: 'TV ao vivo' },
    { id: 'movie', label: 'Filmes' },
    { id: 'series', label: 'Séries' },
];

const BADGE_LABEL: Record<'live' | 'movie' | 'series', string> = {
    live: 'Ao vivo',
    movie: 'Filme',
    series: 'Série',
};

/**
 * Owns the keystroke-by-keystroke input state so typing never re-renders the
 * result grid. Only the debounced, trimmed value is pushed to the parent.
 */
const SearchInput = memo(function SearchInput({
    debounceMs,
    isSearching,
    onCommit,
}: {
    debounceMs: number;
    isSearching: boolean;
    onCommit: (value: string) => void;
}) {
    const [value, setValue] = useState('');

    useEffect(() => {
        const trimmed = value.trim();
        if (trimmed.length < MIN_QUERY_LENGTH) {
            onCommit('');
            return;
        }

        const timeout = setTimeout(() => onCommit(trimmed), debounceMs);
        return () => clearTimeout(timeout);
    }, [value, debounceMs, onCommit]);

    return (
        <div className="relative max-w-2xl">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-ink-3" />
            </div>
            <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Digite para pesquisar..."
                data-focusable="true"
                tabIndex={0}
                className={[inputClassName, 'h-14 pl-12 pr-12'].join(' ')}
                autoFocus
            />
            {isSearching && (
                <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
                    <LoaderIcon className="h-5 w-5 text-ink-2 animate-spin" />
                </div>
            )}
        </div>
    );
});

const SearchResultCard = memo(function SearchResultCard({ item }: { item: CatalogItem }) {
    return (
        <Poster
            href={item.href}
            title={item.name}
            image={item.image}
            ratio={item.type === 'live' ? 'square' : 'poster'}
            rating={item.rating}
            badge={{ text: BADGE_LABEL[item.type] }}
        />
    );
});

const SearchResultsGrid = memo(function SearchResultsGrid({
    items,
    hasMore,
    sentinelRef,
}: {
    items: CatalogItem[];
    hasMore: boolean;
    sentinelRef: React.RefObject<HTMLDivElement | null>;
}) {
    return (
        <>
            <CardGrid base={2} md={4} lg={5} xl={6} gap={6}>
                {items.map((item) => (
                    <SearchResultCard key={`${item.type}-${item.id}`} item={item} />
                ))}
            </CardGrid>
            {hasMore && (
                <div ref={sentinelRef} className="h-20 flex items-center justify-center p-4">
                    <Loader size="small" />
                </div>
            )}
        </>
    );
});

export default function SearchPage() {
    const { searchCachedStreams } = useData();
    const tuning = useMemo(() => SEARCH_TUNING[getDeviceProfile().tier], []);

    const [query, setQuery] = useState('');
    const [activeTab, setActiveTab] = useState<SearchCategory>('all');
    const [results, setResults] = useState<CatalogItem[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Only the newest query may write to state: SQLite answers in a few ms, but
    // the responses are still promises and a slow one must not overwrite a fresh one.
    const latestRequestRef = useRef(0);

    const handleCommit = useCallback((value: string) => {
        setQuery(value);
        if (value.length < MIN_QUERY_LENGTH) {
            latestRequestRef.current += 1;
            setResults([]);
            setIsSearching(false);
            setError(null);
        } else {
            setIsSearching(true);
        }
    }, []);

    useEffect(() => {
        if (query.length < MIN_QUERY_LENGTH) return;

        let cancelled = false;
        const requestId = ++latestRequestRef.current;
        setIsSearching(true);

        (async () => {
            try {
                const streams = await searchCachedStreams(
                    query,
                    activeTab === 'all' ? undefined : activeTab,
                    tuning.limit,
                );

                if (cancelled || requestId !== latestRequestRef.current) return;

                setResults(toCatalogItems(streams));
                setError(null);
            } catch (err) {
                if (cancelled || requestId !== latestRequestRef.current) return;
                console.error('Search request failed', err);
                setResults([]);
                setError('Falha ao buscar no catálogo sincronizado.');
            } finally {
                if (!cancelled && requestId === latestRequestRef.current) setIsSearching(false);
            }
        })();

        return () => { cancelled = true; };
    }, [query, activeTab, searchCachedStreams, tuning.limit]);

    const { visibleItems, hasMore, sentinelRef } = useInfiniteScroll(results, {
        initialBatchSize: tuning.initialBatch,
        loadBatchSize: tuning.loadBatch,
    });

    const showEmptyHint = query.length < MIN_QUERY_LENGTH;

    return (
        <div className="min-h-full flex flex-col space-y-8 p-4 md:p-6 lg:p-10">
            <div className="flex flex-col space-y-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-semibold text-ink tracking-tight">Pesquisar</h1>
                    <p className="text-ink-2 mt-1 text-sm md:text-base">Encontre seus filmes, séries e canais favoritos.</p>
                </div>

                <SearchInput debounceMs={tuning.debounceMs} isSearching={isSearching} onCommit={handleCommit} />

                <div className="flex flex-wrap">
                    {TABS.map((tab) => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                data-focusable="true"
                                tabIndex={0}
                                className={[
                                    'mr-2 h-10 px-4 rounded-full text-sm font-medium transition-colors whitespace-nowrap',
                                    isActive ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2 border border-line',
                                ].join(' ')}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="flex-1 min-h-[300px]">
                {showEmptyHint ? (
                    <EmptyState icon={Search} title="Comece a digitar para pesquisar" />
                ) : error ? (
                    <EmptyState icon={AlertCircle} title={error} />
                ) : isSearching && results.length === 0 ? (
                    <CardGrid base={2} md={4} lg={5} xl={6} gap={6}>
                        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
                            <div key={index} className="ratio ratio-poster rounded-xl overflow-hidden">
                                <Skeleton className="ratio-fill" />
                            </div>
                        ))}
                    </CardGrid>
                ) : results.length === 0 ? (
                    <EmptyState icon={AlertCircle} title={`Nenhum resultado encontrado para "${query}"`} />
                ) : (
                    <SearchResultsGrid
                        items={visibleItems}
                        hasMore={hasMore}
                        sentinelRef={sentinelRef}
                    />
                )}
            </div>
        </div>
    );
}
