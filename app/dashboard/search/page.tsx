'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Search, Film, Tv, Layers, Play, Info, AlertCircle, Loader as LoaderIcon } from 'lucide-react';
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

export default function SearchPage() {
    const { user, credentials } = useAuth();
    const { getAllCachedStreams } = useData();
    const [query, setQuery] = useState('');
    const [activeTab, setActiveTab] = useState<SearchCategory>('all');
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [data, setData] = useState<{
        live: any[];
        movies: any[];
        series: any[];
    }>({ live: [], movies: [], series: [] });
    const [error, setError] = useState<string | null>(null);

    // Load data from cache or API
    useEffect(() => {
        const loadCatalog = async () => {
            if (!credentials) return;

            try {
                setInitialLoading(true);

                // Try cache first
                const [cachedLive, cachedMovies, cachedSeries] = await Promise.all([
                    getAllCachedStreams('live'),
                    getAllCachedStreams('movie'),
                    getAllCachedStreams('series')
                ]);

                if (cachedLive.length > 0 || cachedMovies.length > 0 || cachedSeries.length > 0) {
                    setData({
                        live: cachedLive.map(s => s.data),
                        movies: cachedMovies.map(s => s.data),
                        series: cachedSeries.map(s => s.data)
                    });
                    setInitialLoading(false);
                    return;
                }

                // Fallback to API if cache empty
                const { username, password, hostUrl } = credentials;
                const requestBody = { username, password, hostUrl };

                const [liveRes, moviesRes, seriesRes] = await Promise.all([
                    fetch('/api/proxy', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...requestBody, action: 'get_live_streams' })
                    }),
                    fetch('/api/proxy', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...requestBody, action: 'get_vod_streams' })
                    }),
                    fetch('/api/proxy', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...requestBody, action: 'get_series' })
                    })
                ]);

                const liveData = await liveRes.json();
                const moviesData = await moviesRes.json();
                const seriesData = await seriesRes.json();

                setData({
                    live: Array.isArray(liveData) ? liveData : [],
                    movies: Array.isArray(moviesData) ? moviesData : [],
                    series: Array.isArray(seriesData) ? seriesData : []
                });

            } catch (err) {
                console.error("Failed to load catalog for search", err);
                setError("Falha ao indexar conteúdo para busca. Por favor, verifique sua conexão.");
            } finally {
                setInitialLoading(false);
            }
        };

        loadCatalog();
    }, [credentials, getAllCachedStreams]);

    // Filter data based on query
    const results = useMemo(() => {
        if (!query || query.length < 2) return [];

        const lowerQuery = query.toLowerCase();

        const filterItems = (items: any[], type: 'live' | 'movie' | 'series') => {
            return items
                .filter(item => item.name && item.name.toLowerCase().includes(lowerQuery))
                .map(item => ({
                    id: item.stream_id || item.series_id,
                    name: item.name,
                    type,
                    image: item.stream_icon || item.cover,
                    rating: item.rating
                }));
        };

        const liveResults = activeTab === 'all' || activeTab === 'live' ? filterItems(data.live, 'live') : [];
        const movieResults = activeTab === 'all' || activeTab === 'movie' ? filterItems(data.movies, 'movie') : [];
        const seriesResults = activeTab === 'all' || activeTab === 'series' ? filterItems(data.series, 'series') : [];

        return [...liveResults, ...movieResults, ...seriesResults];
    }, [query, data, activeTab]);

    const { visibleItems, hasMore, sentinelRef } = useInfiniteScroll(results, { initialBatchSize: 30 });

    return (
        <div className="min-h-full flex flex-col space-y-8 p-4 md:p-6 lg:p-10">
            {/* Header & Search Input */}
            <div className="flex flex-col gap-6">
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
                    {initialLoading && (
                        <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
                            <LoaderIcon className="h-5 w-5 text-red-600 animate-spin" />
                        </div>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
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
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-medium transition-all duration-300 whitespace-nowrap focus:outline-none focus:ring-4 focus:ring-white ${isActive
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
                {initialLoading && results.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4">
                        <LoaderIcon className="w-10 h-10 animate-spin text-red-600" />
                        <p className="animate-pulse">Indexando catálogo...</p>
                    </div>
                ) : query.length < 2 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600 opacity-50">
                        <Search className="w-24 h-24 mb-4" />
                        <p className="text-xl font-medium">Comece a digitar para pesquisar</p>
                    </div>
                ) : results.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500">
                        <AlertCircle className="w-12 h-12 mb-4 text-red-500/50" />
                        <p className="text-lg">Nenhum resultado encontrado para "{query}"</p>
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
                                            <div className="aspect-[2/3] relative">
                                                {item.image ? (
                                                    <img
                                                        src={item.image}
                                                        alt={item.name}
                                                        className="w-full h-full object-cover"
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-white/5 text-gray-600">
                                                        {item.type === 'live' ? <Tv size={40} /> : item.type === 'movie' ? <Film size={40} /> : <Layers size={40} />}
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                                                    <Play className="text-white fill-current w-12 h-12 drop-shadow-lg scale-0 group-hover:scale-110 transition-transform duration-300" />
                                                </div>
                                                <div className="absolute top-2 right-2 bg-black/80 px-2 py-1 rounded text-xs font-bold uppercase text-white tracking-wider border border-white/10">
                                                    {item.type === 'live' ? 'ao vivo' : item.type === 'movie' ? 'filme' : 'série'}
                                                </div>
                                            </div>
                                            <div className="p-4">
                                                <h3 className="text-white font-medium line-clamp-2 text-sm">{item.name}</h3>
                                                {item.rating && (
                                                    <div className="flex items-center gap-1 mt-1">
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
