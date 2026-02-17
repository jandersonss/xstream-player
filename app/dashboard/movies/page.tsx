'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import Link from 'next/link';
import { Film, PlayCircle } from 'lucide-react';
import Loader from '@/components/Loader';
import SortControls, { SortOption } from '@/components/SortControls';
import { useSortPreference } from '@/app/hooks/useSortPreference';

import HeroSection from '@/components/HeroSection'; // Added import

interface Category {
    category_id: string;
    category_name: string;
    parent_id: number;
}

export default function MovieCategories() {
    const { credentials } = useAuth();
    const { getCachedCategories } = useData();
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [sort, setSort] = useSortPreference('cat_movies', 'name-asc');

    useEffect(() => {
        if (!credentials) return;

        const loadData = async () => {
            try {
                // Try cache first
                const cached = await getCachedCategories('movie');
                if (cached && cached.length > 0) {
                    setCategories(cached);
                    setLoading(false);
                    return;
                }

                // Fallback to fetch
                const res = await fetch('/api/proxy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...credentials,
                        action: 'get_vod_categories'
                    })
                });

                const data = await res.json();
                if (Array.isArray(data)) {
                    setCategories(data);
                } else {
                    setError('Falha ao carregar categorias');
                }
            } catch (err) {
                setError('Erro ao buscar categorias');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [credentials, getCachedCategories]);

    const sortedCategories = [...categories].sort((a, b) => {
        if (sort === 'name-asc') return a.category_name.localeCompare(b.category_name);
        if (sort === 'name-desc') return b.category_name.localeCompare(a.category_name);
        return 0;
    });

    if (loading) return <Loader />;
    if (error) return <div className="text-red-500">{error}</div>;

    return (
        <div className="relative w-full -mt-20"> {/* Negative margin to pull beneath fixed header if needed, similar to Dashboard */}

            {/* Hero Section specific for Movies */}
            <HeroSection type='movie' />

            <div className="pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 mt-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 md:p-3 bg-blue-600 rounded-lg shadow-lg shadow-blue-900/40">
                            <Film size={24} className="text-white" />
                        </div>
                        <h1 className="text-2xl md:text-3xl font-bold text-white">Categorias de Filmes</h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-500 uppercase tracking-widest hidden sm:block">Ordenar Categorias</span>
                        <SortControls currentSort={sort} onSortChange={setSort} />
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                    {sortedCategories.map((cat) => (
                        <Link
                            key={cat.category_id}
                            href={`/dashboard/movies/${cat.category_id}`}
                            data-focusable="true"
                            tabIndex={0}
                            className="group block bg-[#1f1f1f] hover:bg-[#252525] border border-[#333] hover:border-blue-600 rounded-xl p-6 transition-all duration-200 hover:shadow-lg hover:to-blue-900/10 cursor-pointer relative overflow-hidden focus:outline-none focus:ring-4 focus:ring-blue-600 focus:scale-105 z-10"
                        >
                            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-transparent to-white/5 rounded-bl-full transform translate-x-8 -translate-y-8 group-hover:translate-x-4 group-hover:-translate-y-4 transition-transform duration-500"></div>

                            <div className="relative z-10 flex flex-col items-start gap-4 h-full justify-between">
                                <div>
                                    <h3 className="font-semibold text-gray-200 group-hover:text-white line-clamp-3 leading-tight">
                                        {cat.category_name}
                                    </h3>
                                </div>

                                <div className="w-full flex items-center justify-between mt-2 pt-4 border-t border-[#333] group-hover:border-blue-600/30 transition-colors">
                                    <span className="text-xs font-medium text-gray-500 group-hover:text-blue-400 uppercase tracking-widest">
                                        Explorar
                                    </span>
                                    <PlayCircle size={20} className="text-gray-600 group-hover:text-blue-500 transition-colors" />
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
