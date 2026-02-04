'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import Link from 'next/link';
import { Layers, PlayCircle } from 'lucide-react';
import Loader from '@/components/Loader';
import SortControls, { SortOption } from '@/components/SortControls';
import { useSortPreference } from '@/app/hooks/useSortPreference';

interface Category {
    category_id: string;
    category_name: string;
    parent_id: number;
}

export default function SeriesCategories() {
    const { credentials } = useAuth();
    const { getCachedCategories } = useData();
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [sort, setSort] = useSortPreference('cat_series', 'name-asc');

    useEffect(() => {
        if (!credentials) return;

        const loadData = async () => {
            try {
                // Try cache first
                const cached = await getCachedCategories('series');
                if (cached && cached.length > 0) {
                    setCategories(cached);
                    setLoading(false);
                    return;
                }

                const res = await fetch('/api/proxy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...credentials,
                        action: 'get_series_categories'
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
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <div className="p-2 md:p-3 bg-purple-600 rounded-lg shadow-lg shadow-purple-900/40">
                        <Layers size={24} className="text-white" />
                    </div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white">Categorias de Séries</h1>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-400 uppercase tracking-widest hidden sm:block">Ordenar</span>
                    <SortControls currentSort={sort} onSortChange={setSort} />
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {sortedCategories.map((cat) => (
                    <Link
                        key={cat.category_id}
                        href={`/dashboard/series/${cat.category_id}`}
                        data-focusable="true"
                        tabIndex={0}
                        className="group block bg-[#1f1f1f] hover:bg-[#252525] border border-[#333] hover:border-purple-600 rounded-xl p-6 transition-all duration-200 hover:shadow-lg hover:to-purple-900/10 cursor-pointer relative overflow-hidden focus:outline-none focus:ring-4 focus:ring-purple-600 focus:scale-105 z-10"
                    >
                        <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-transparent to-white/5 rounded-bl-full transform translate-x-8 -translate-y-8 group-hover:translate-x-4 group-hover:-translate-y-4 transition-transform duration-500"></div>

                        <div className="relative z-10 flex flex-col items-start gap-4 h-full justify-between">
                            <div>
                                <h3 className="font-semibold text-gray-200 group-hover:text-white text-lg line-clamp-2 leading-tight">
                                    {cat.category_name}
                                </h3>
                            </div>

                            <div className="w-full flex items-center justify-between mt-2 pt-4 border-t border-[#333] group-hover:border-purple-600/30 transition-colors">
                                <span className="text-xs font-medium text-gray-500 group-hover:text-purple-400 uppercase tracking-widest">
                                    Episódios
                                </span>
                                <PlayCircle size={20} className="text-gray-600 group-hover:text-purple-500 transition-colors" />
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
