'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Film, Tv, Layers, Play, AlertCircle, Loader as LoaderIcon } from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

type SearchCategory = 'all' | 'live' | 'movie' | 'series';

interface SearchResult {
    id: string | number;
    name: string;
    type: 'live' | 'movie' | 'series';
    image?: string;
    rating?: string;
}

import { useData } from '../../context/DataContext';
import { useInfiniteScroll } from '@/app/hooks/useInfiniteScroll';
import Loader from '@/components/Loader';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

export default function SearchPage() {
    const { searchCachedStreams } = useData();
    const [query, setQuery] = useState('');
    const [activeTab, setActiveTab] = useState<SearchCategory>('all');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Only the newest query may write to state: SQLite answers in a few ms, but
    // the responses are still promises and a slow one must not overwrite a fresh one.
    const latestRequestRef = useRef(0);

    useEffect(() => {
        const trimmed = query.trim();

        if (trimmed.length < MIN_QUERY_LENGTH) {
            latestRequestRef.current += 1;
            setResults([]);
            setIsSearching(false);
            setError(null);
            return;
        }

        setIsSearching(true);

        const timeout = setTimeout(async () => {
            const requestId = ++latestRequestRef.current;

            try {
                const streams = await searchCachedStreams(
                    trimmed,
                    activeTab === 'all' ? undefined : activeTab,
                );

                if (requestId !== latestRequestRef.current) return;

                setResults(streams.map(stream => ({
                    id: stream.id,
                    name: stream.name,
                    type: stream.type,
                    image: stream.icon || stream.cover,
                    rating: stream.rating,
                })));
                setError(null);
            } catch (err) {
                if (requestId !== latestRequestRef.current) return;

                console.error('Search request failed', err);
                setResults([]);
                setError('Falha ao buscar no catálogo sincronizado.');
            } finally {
                if (requestId === latestRequestRef.current) setIsSearching(false);
            }
        }, DEBOUNCE_MS);

        return () => clearTimeout(timeout);
    }, [query, activeTab, searchCachedStreams]);

    const { visibleItems, hasMore, sentinelRef } = useInfiniteScroll(results, { initialBatchSize: 30 });

    return (
        <div className="min-h-full flex flex-col space-y-8 p-4 md:p-6 lg:p-10">
            {/* Header & Search Input */}
            <div className="flex flex-col space-y-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Pesquisar</h1>
                    <p className="text-gray-400 mt-1 text-sm md:text-base">Encontre seus filmes, séries e canais favoritos.</p>
                </div>

                <div className="relative max-w-2xl">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Search className="h-6 w-6 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
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

                {/* Tabs */}
                <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-hide">
                    {[
                        { id: 'all', label: 'Tudo', icon: Search },
                        { id: 'live', label: 'TV ao Vivo', icon: Tv },
                        { id: 'movie', label: 'Filmes', icon: Film },
                        { id: 'series', label: 'Séries', icon: Layers },
                    ].map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as SearchCategory)}
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

            {/* Results */}
            <div className="flex-1 min-h-[300px]">
                {query.trim().length < MIN_QUERY_LENGTH ? (
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
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                            <AnimatePresence>
                                {(visibleItems as SearchResult[]).map((item) => (
                                    <motion.div
                                        key={`${item.type}-${item.id}`}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0 }}
                                        layout
                                        className="group relative bg-[#1a1a1a] rounded-xl overflow-hidden hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-red-900/10 border border-white/5 hover:border-red-500/30"
                                    >
                                        <Link
                                            href={
                                                item.type === 'live' ? `/dashboard/watch/live/${item.id}` :
                                                    item.type === 'movie' ? `/dashboard/watch/movie/${item.id}` :
                                                        `/dashboard/watch/series/${item.id}`
                                            }
                                            data-focusable="true"
                                            tabIndex={0}
                                            className="block focus:outline-none focus:ring-4 focus:ring-red-600 focus:scale-105 z-10 rounded-xl"
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
                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-">
                                                    <Play className="text-white fill-current w-12 h-12 drop-shadow-lg scale-0 group-hover:scale-110 transition-transform duration-300" />
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
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                        {hasMore && (
                            <div ref={sentinelRef} className="h-20 flex items-center justify-center p-4">
                                <Loader size="small" />
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
