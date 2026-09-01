'use client';

import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { Search, Film, Tv, Layers, Play, AlertCircle, Loader as LoaderIcon } from 'lucide-react';
import Link from 'next/link';

import { useData } from '../../context/DataContext';
import { useInfiniteScroll } from '@/app/hooks/useInfiniteScroll';
import { getDeviceProfile, type DeviceTier } from '@/app/lib/deviceProfile';
import Loader from '@/components/Loader';
import CardGrid from '@/components/CardGrid';

type SearchCategory = 'all' | 'live' | 'movie' | 'series';

interface SearchResult {
    id: string | number;
    name: string;
    type: 'live' | 'movie' | 'series';
    image?: string;
    rating?: string;
}

const MIN_QUERY_LENGTH = 2;

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

const TABS: { id: SearchCategory; label: string; icon: typeof Search }[] = [
    { id: 'all', label: 'Tudo', icon: Search },
    { id: 'live', label: 'TV ao Vivo', icon: Tv },
    { id: 'movie', label: 'Filmes', icon: Film },
    { id: 'series', label: 'Séries', icon: Layers },
];

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
                <Search className="h-6 w-6 text-gray-400" />
            </div>
            <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Digite para pesquisar..."
                data-focusable="true"
                tabIndex={0}
                className="block w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-4 focus:ring-red-600 focus:bg-white/10 transition-all text-lg"
                autoFocus
            />
            {isSearching && (
                <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
                    <LoaderIcon className="h-5 w-5 text-red-600 animate-spin" />
                </div>
            )}
        </div>
    );
});

const SearchResultCard = memo(function SearchResultCard({ item }: { item: SearchResult }) {
    const href =
        item.type === 'live' ? `/dashboard/watch/live/${item.id}` :
            item.type === 'movie' ? `/dashboard/watch/movie/${item.id}` :
                `/dashboard/watch/series/${item.id}`;

    return (
        <div className="group relative bg-[#1a1a1a] rounded-xl overflow-hidden hover:scale-105 transition-transform duration-300 shadow-lg border border-white/5 hover:border-red-500/30">
            <Link
                href={href}
                data-focusable="true"
                tabIndex={0}
                className="block focus:outline-none focus:ring-4 focus:ring-red-600 z-10 rounded-xl"
            >
                {/* pt-[150%] keeps the 2:3 poster box on Chrome < 88 (no aspect-ratio) */}
                <div className="relative pt-[150%]">
                    {item.image ? (
                        <img
                            src={item.image}
                            alt={item.name}
                            className="absolute inset-0 w-full h-full object-cover"
                            loading="lazy"
                        />
                    ) : (
                        <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-white/5 text-gray-600">
                            {item.type === 'live' ? <Tv size={40} /> : item.type === 'movie' ? <Film size={40} /> : <Layers size={40} />}
                        </div>
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Play className="text-white fill-current w-12 h-12 drop-shadow-lg" />
                    </div>
                    <div className="absolute top-2 right-2 bg-black/80 px-2 py-1 rounded text-xs font-bold uppercase text-white tracking-wider border border-white/10">
                        {item.type === 'live' ? 'ao vivo' : item.type === 'movie' ? 'filme' : 'série'}
                    </div>
                </div>
                <div className="p-4">
                    <h3 className="text-white font-medium line-clamp-2 text-sm">{item.name}</h3>
                    {item.rating && (
                        <div className="flex items-center space-x-1 mt-1">
                            <span className="text-yellow-500 text-xs">★</span>
                            <span className="text-gray-400 text-xs">{item.rating}</span>
                        </div>
                    )}
                </div>
            </Link>
        </div>
    );
});

const SearchResultsGrid = memo(function SearchResultsGrid({
    items,
    hasMore,
    sentinelRef,
}: {
    items: SearchResult[];
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
    const [results, setResults] = useState<SearchResult[]>([]);
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

                setResults(streams.map(stream => ({
                    id: stream.id,
                    name: stream.name,
                    type: stream.type,
                    image: stream.icon || stream.cover,
                    rating: stream.rating,
                })));
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
                    <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Pesquisar</h1>
                    <p className="text-gray-400 mt-1 text-sm md:text-base">Encontre seus filmes, séries e canais favoritos.</p>
                </div>

                <SearchInput debounceMs={tuning.debounceMs} isSearching={isSearching} onCommit={handleCommit} />

                <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-hide">
                    {TABS.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                data-focusable="true"
                                tabIndex={0}
                                className={`flex items-center space-x-2 px-6 py-2.5 rounded-full font-medium transition-all duration-300 whitespace-nowrap focus:outline-none focus:ring-4 focus:ring-white ${isActive
                                    ? 'bg-red-600 text-white shadow-lg shadow-red-900/40'
                                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                                    }`}
                            >
                                <Icon size={18} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="flex-1 min-h-[300px]">
                {showEmptyHint ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600 opacity-50">
                        <Search className="w-24 h-24 mb-4" />
                        <p className="text-xl font-medium">Comece a digitar para pesquisar</p>
                    </div>
                ) : error ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500">
                        <AlertCircle className="w-12 h-12 mb-4 text-red-500/50" />
                        <p className="text-lg">{error}</p>
                    </div>
                ) : isSearching && results.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4">
                        <LoaderIcon className="w-10 h-10 animate-spin text-red-600" />
                        <p className="animate-pulse">Buscando...</p>
                    </div>
                ) : results.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500">
                        <AlertCircle className="w-12 h-12 mb-4 text-red-500/50" />
                        <p className="text-lg">Nenhum resultado encontrado para &quot;{query}&quot;</p>
                    </div>
                ) : (
                    <SearchResultsGrid
                        items={visibleItems as SearchResult[]}
                        hasMore={hasMore}
                        sentinelRef={sentinelRef}
                    />
                )}
            </div>
        </div>
    );
}
