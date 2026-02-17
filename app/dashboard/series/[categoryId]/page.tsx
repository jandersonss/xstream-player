'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useParams } from 'next/navigation';
import Loader from '@/components/Loader';
import { ArrowLeft, Layers, Play, Star, Calendar } from 'lucide-react';
import Link from 'next/link';

interface Series {
    series_id: string | number;
    name: string;
    cover: string;
    plot: string;
    cast: string;
    director: string;
    genre: string;
    releaseDate: string;
    rating: string;
    rating_5based: string;
    backdrop_path: string[];
}

import { useData } from '../../../context/DataContext';
import SortControls, { SortOption } from '@/components/SortControls';
import { useSortPreference } from '@/app/hooks/useSortPreference';

export default function SeriesList() {
    const { credentials } = useAuth();
    const { categoryId } = useParams();
    const { getCachedStreams, getCachedCategories } = useData();

    const [seriesList, setSeriesList] = useState<Series[]>([]);
    const [categoryName, setCategoryName] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [sort, setSort] = useSortPreference('series', 'added');

    useEffect(() => {
        if (!credentials || !categoryId) return;

        const loadData = async () => {
            try {
                // Fetch category name
                const categories = await getCachedCategories('series');
                const category = categories.find(c => c.category_id === categoryId);
                if (category) {
                    setCategoryName(category.category_name);
                }

                // Try cache first
                const cached = await getCachedStreams(categoryId as string, 'series');
                if (cached && cached.length > 0) {
                    setSeriesList(cached.map(s => ({ ...s.data, series_id: s.id })));
                    setLoading(false);
                    return;
                }

                const res = await fetch('/api/proxy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...credentials,
                        action: 'get_series',
                        category_id: categoryId
                    })
                });

                const data = await res.json();
                if (Array.isArray(data)) {
                    setSeriesList(data);
                } else {
                    setSeriesList([]);
                }
            } catch (err) {
                setError('Falha ao buscar séries');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [credentials, categoryId, getCachedStreams, getCachedCategories]);

    const sortedSeries = [...seriesList].sort((a, b) => {
        if (sort === 'name-asc') return a.name.localeCompare(b.name);
        if (sort === 'name-desc') return b.name.localeCompare(a.name);
        if (sort === 'added') {
            // Some objects might have 'last_modified' or 'added'
            const dateA = (a as any).last_modified || (a as any).added || 0;
            const dateB = (b as any).last_modified || (b as any).added || 0;
            return dateB - dateA;
        }
        if (sort === 'year') {
            const yearA = parseInt(a.releaseDate?.split('-')[0] || a.name.match(/\d{4}/)?.[0] || '0');
            const yearB = parseInt(b.releaseDate?.split('-')[0] || b.name.match(/\d{4}/)?.[0] || '0');
            return yearB - yearA;
        }
        return 0;
    });

    if (loading) return <Loader />;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <Link
                    href="/dashboard/series"
                    data-focusable="true"
                    tabIndex={0}
                    className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors focus:outline-none focus:text-purple-500 focus:scale-110 origin-left"
                >
                    <ArrowLeft size={20} />
                    Voltar para Categorias
                </Link>
                <SortControls currentSort={sort} onSortChange={setSort} showYear />
            </div>

            <div className="space-y-4">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-8 bg-purple-600 rounded-full"></span>
                    {categoryName || 'Séries'} ({seriesList.length})
                </h3>

                {seriesList.length === 0 && !error ? (
                    <p className="text-gray-500">Nenhuma série encontrada nesta categoria.</p>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                        {sortedSeries.map((item) => (
                            <Link
                                key={item.series_id}
                                href={`/dashboard/watch/series/${item.series_id}`}
                                data-focusable="true"
                                tabIndex={0}
                                className="group relative bg-[#1f1f1f] rounded-xl overflow-hidden shadow-lg hover:shadow-2xl hover:shadow-purple-900/20 transition-all duration-300 transform hover:-translate-y-1 focus:outline-none focus:ring-4 focus:ring-purple-600 focus:scale-105 z-10"
                            >
                                <div className="aspect-[2/3] relative overflow-hidden bg-black">
                                    {item.cover ? (
                                        <img
                                            src={item.cover}
                                            alt={item.name}
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                            onError={(e) => (e.currentTarget.style.display = 'none')}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-700">
                                            <Layers size={48} />
                                        </div>
                                    )}

                                    {/* Overlay */}
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                                        <div className="bg-white/20 backdrop-blur-md p-4 rounded-full text-white border border-white/30">
                                            <Play fill="currentColor" size={24} className="ml-1" />
                                        </div>
                                    </div>

                                    {item.rating && (
                                        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-xs font-bold text-yellow-500 flex items-center gap-1">
                                            <Star size={10} fill="currentColor" /> {item.rating}
                                        </div>
                                    )}
                                </div>

                                <div className="p-4">
                                    <h4 className="font-semibold text-gray-200 group-hover:text-white line-clamp-2 text-base mb-1" title={item.name}>
                                        {item.name}
                                    </h4>
                                    <div className="flex justify-between items-center text-xs text-gray-500">
                                        {item.releaseDate && (
                                            <span className="flex items-center gap-1"><Calendar size={10} /> {item.releaseDate.split('-')[0]}</span>
                                        )}
                                        <span>ID: {item.series_id}</span>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
