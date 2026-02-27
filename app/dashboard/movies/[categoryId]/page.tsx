'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useParams } from 'next/navigation';
import Loader from '@/components/Loader';
import { ArrowLeft, Film, Play, Star } from 'lucide-react';
import Link from 'next/link';

interface Movie {
    stream_id: string | number;
    name: string;
    stream_icon: string;
    rating: string;
    added: string;
    container_extension: string;
}

import { useData } from '../../../context/DataContext';
import SortControls, { SortOption } from '@/components/SortControls';
import { useSortPreference } from '@/app/hooks/useSortPreference';
import { useInfiniteScroll } from '@/app/hooks/useInfiniteScroll';
import { useMemo } from 'react';

export default function MovieList() {
    const { credentials } = useAuth();
    const { categoryId } = useParams();
    const { getCachedStreams, getCachedCategories } = useData();

    const [movies, setMovies] = useState<Movie[]>([]);
    const [categoryName, setCategoryName] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [sort, setSort] = useSortPreference('movies', 'added');

    useEffect(() => {
        if (!credentials || !categoryId) return;

        const loadData = async () => {
            try {
                // Fetch category name
                const categories = await getCachedCategories('movie');
                const category = categories.find(c => c.category_id === categoryId);
                if (category) {
                    setCategoryName(category.category_name);
                }

                // Try cache first
                const cached = await getCachedStreams(categoryId as string, 'movie');
                if (cached && cached.length > 0) {
                    setMovies(cached.map(s => ({ ...s.data, stream_id: s.id })));
                    setLoading(false);
                    return;
                }

                // Fallback to fetch
                const res = await fetch('/api/proxy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...credentials,
                        action: 'get_vod_streams',
                        category_id: categoryId
                    })
                });

                const data = await res.json();
                if (Array.isArray(data)) {
                    setMovies(data);
                } else {
                    setMovies([]);
                }
            } catch (err) {
                setError('Falha ao buscar filmes');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [credentials, categoryId, getCachedStreams, getCachedCategories]);

    const sortedMovies = useMemo(() => {
        return [...movies].sort((a, b) => {
            if (sort === 'name-asc') return a.name.localeCompare(b.name);
            if (sort === 'name-desc') return b.name.localeCompare(a.name);
            if (sort === 'added') return new Date(b.added || 0).getTime() - new Date(a.added || 0).getTime();
            if (sort === 'year') {
                const yearA = parseInt(a.name.match(/\d{4}/)?.[0] || '0');
                const yearB = parseInt(b.name.match(/\d{4}/)?.[0] || '0');
                return yearB - yearA;
            }
            return 0;
        });
    }, [movies, sort]);

    const { visibleItems, hasMore, sentinelRef } = useInfiniteScroll(sortedMovies);

    if (loading) return <Loader />;

    return (
        <div className="space-y-6 p-4 md:p-6 lg:p-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <Link
                    href="/dashboard/movies"
                    data-focusable="true"
                    tabIndex={0}
                    className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors focus:outline-none focus:text-blue-500 focus:scale-110 origin-left"
                >
                    <ArrowLeft size={20} />
                    Voltar para Categorias
                </Link>
                <SortControls currentSort={sort} onSortChange={setSort} showYear />
            </div>

            <div className="space-y-4">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-8 bg-blue-600 rounded-full"></span>
                    {categoryName || 'Filmes'} ({movies.length})
                </h3>

                {movies.length === 0 && !error ? (
                    <p className="text-gray-500">Nenhum filme encontrado nesta categoria.</p>
                ) : (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                            {(visibleItems as Movie[]).map((movie) => (
                                <Link
                                    key={movie.stream_id}
                                    href={`/dashboard/watch/movie/${movie.stream_id}`}
                                    data-focusable="true"
                                    tabIndex={0}
                                    className="group relative bg-[#1f1f1f] rounded-xl overflow-hidden shadow-lg hover:shadow-2xl hover:shadow-blue-900/20 transition-all duration-300 transform hover:-translate-y-1 focus:outline-none focus:ring-4 focus:ring-blue-600 focus:scale-105 z-10"
                                >
                                    <div className="aspect-[2/3] relative overflow-hidden bg-black">
                                        {movie.stream_icon ? (
                                            <img
                                                src={movie.stream_icon}
                                                alt={movie.name}
                                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                onError={(e) => (e.currentTarget.style.display = 'none')}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-700">
                                                <Film size={48} />
                                            </div>
                                        )}

                                        {/* Overlay */}
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                                            <div className="bg-white/20 backdrop-blur-md p-4 rounded-full text-white border border-white/30">
                                                <Play fill="currentColor" size={24} className="ml-1" />
                                            </div>
                                        </div>

                                        {movie.rating && (
                                            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-xs font-bold text-yellow-500 flex items-center gap-1">
                                                <Star size={10} fill="currentColor" /> {movie.rating}
                                            </div>
                                        )}
                                    </div>

                                    <div className="p-4">
                                        <h4 className="font-semibold text-gray-200 group-hover:text-white line-clamp-2 text-base mb-1" title={movie.name}>
                                            {movie.name}
                                        </h4>
                                        <div className="flex justify-between items-center text-xs text-gray-500">
                                            <span className="uppercase">{movie.container_extension}</span>
                                            <span>ID: {movie.stream_id}</span>
                                        </div>
                                    </div>
                                </Link>
                            ))}
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
