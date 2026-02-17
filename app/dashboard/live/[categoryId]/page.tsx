'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useParams } from 'next/navigation';
import VideoPlayer from '@/components/VideoPlayer';
import Loader from '@/components/Loader';
import { ArrowLeft, Wifi } from 'lucide-react';
import Link from 'next/link';

interface Stream {
    stream_id: string | number;
    name: string;
    stream_type: string;
    stream_icon: string;
    epg_channel_id: string;
    added: string;
    category_id: string;
}

import { useData } from '../../../context/DataContext';
import SortControls, { SortOption } from '@/components/SortControls';
import { useSortPreference } from '@/app/hooks/useSortPreference';
import { useInfiniteScroll } from '@/app/hooks/useInfiniteScroll';

export default function LiveStreams() {
    const { credentials } = useAuth();
    const { categoryId } = useParams();
    const { getCachedStreams, getCachedCategories } = useData();

    const [streams, setStreams] = useState<Stream[]>([]);
    const [categoryName, setCategoryName] = useState('');
    const [activeStream, setActiveStream] = useState<Stream | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [sort, setSort] = useSortPreference('live', 'added');

    useEffect(() => {
        if (!credentials || !categoryId) return;

        const loadData = async () => {
            try {
                // Fetch category name
                const categories = await getCachedCategories('live');
                const category = categories.find(c => c.category_id === categoryId);
                if (category) {
                    setCategoryName(category.category_name);
                }

                // Try cache first
                const cached = await getCachedStreams(categoryId as string, 'live');
                if (cached && cached.length > 0) {
                    setStreams(cached.map(s => ({ ...s.data, stream_id: s.id })));
                    setLoading(false);
                    return;
                }

                const res = await fetch('/api/proxy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...credentials,
                        action: 'get_live_streams',
                        category_id: categoryId
                    })
                });

                const data = await res.json();
                if (Array.isArray(data)) {
                    setStreams(data);
                } else {
                    setStreams([]);
                }
            } catch (err) {
                setError('Falha ao buscar canais');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [credentials, categoryId, getCachedStreams, getCachedCategories]);

    const sortedStreams = useMemo(() => {
        return [...streams].sort((a, b) => {
            if (sort === 'name-asc') return a.name.localeCompare(b.name);
            if (sort === 'name-desc') return b.name.localeCompare(a.name);
            if (sort === 'added') {
                const dateA = (a as any).added || 0;
                const dateB = (b as any).added || 0;
                return dateB - dateA;
            }
            return 0;
        });
    }, [streams, sort]);

    const { visibleItems, hasMore, sentinelRef } = useInfiniteScroll(sortedStreams);

    const getStreamUrl = (streamId: string | number) => {
        if (!credentials) return '';
        const baseUrl = credentials.hostUrl.replace(/\/$/, '');
        return `${baseUrl}/${credentials.username}/${credentials.password}/${streamId}`;
    };

    if (loading) return <Loader />;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <Link
                    href="/dashboard/live"
                    data-focusable="true"
                    tabIndex={0}
                    className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors focus:outline-none focus:text-red-500 focus:scale-110 origin-left"
                >
                    <ArrowLeft size={20} />
                    Voltar para Categorias
                </Link>
                <SortControls currentSort={sort} onSortChange={setSort} />
            </div>

            <div className="space-y-4">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-8 bg-red-600 rounded-full"></span>
                    {categoryName || 'Canais'} ({streams.length})
                </h3>

                {streams.length === 0 && !error ? (
                    <p className="text-gray-500">Nenhum canal encontrado nesta categoria.</p>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {(visibleItems as Stream[]).map((stream) => (
                                <Link
                                    key={stream.stream_id}
                                    href={`/dashboard/watch/live/${stream.stream_id}`}
                                    data-focusable="true"
                                    tabIndex={0}
                                    className="group bg-[#1f1f1f] hover:bg-[#252525] border border-[#333] rounded-lg p-3 flex items-center gap-4 transition-all focus:outline-none focus:ring-4 focus:ring-red-600 focus:scale-[1.02] z-10 hover:border-gray-500"
                                >
                                    <div className="w-12 h-12 flex-shrink-0 bg-black rounded-md flex items-center justify-center overflow-hidden border border-[#333]">
                                        {stream.stream_icon ? (
                                            <img src={stream.stream_icon} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform" onError={(e) => (e.currentTarget.style.display = 'none')} />
                                        ) : (
                                            <Wifi size={20} className="text-gray-600" />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="font-medium line-clamp-2 text-sm text-gray-300 group-hover:text-white">
                                            {stream.name}
                                        </h4>
                                        <p className="text-xs text-gray-600 truncate">ID: {stream.stream_id}</p>
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
