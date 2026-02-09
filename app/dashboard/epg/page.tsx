'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { useData } from '@/app/context/DataContext';
import { ArrowLeft, Calendar, Filter } from 'lucide-react';
import Link from 'next/link';
import EPGGrid from '@/components/EPGGrid';
import Loader from '@/components/Loader';
import { EPGProgram, XtreamEPGListingItem, convertXtreamToEPGProgram } from '@/app/lib/epg';

interface Channel {
    streamId: string;
    name: string;
    icon: string;
    programs: EPGProgram[];
}

export default function EPGPage() {
    const { credentials } = useAuth();
    const { getCachedCategories, getAllCachedStreams, getShortEPG } = useData();

    const [channels, setChannels] = useState<Channel[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        loadCategories();
    }, []);

    useEffect(() => {
        if (credentials) {
            loadEPGData();
        }
    }, [credentials, selectedCategory]);

    const loadCategories = async () => {
        try {
            const cats = await getCachedCategories('live');
            setCategories(cats);
        } catch (err) {
            console.error('Failed to load categories:', err);
        }
    };

    const loadEPGData = async () => {
        setLoading(true);
        setError('');

        try {
            // Get live streams
            const streams = await getAllCachedStreams('live');

            // Filter by category if selected
            const filteredStreams = selectedCategory === 'all'
                ? streams
                : streams.filter(s => s.category_id === selectedCategory);

            // Limit to 30 channels to avoid overwhelming the API
            const channelsToLoad = filteredStreams.slice(0, 30);

            if (channelsToLoad.length === 0) {
                setChannels([]);
                setLoading(false);
                return;
            }

            // Fetch EPG for each channel
            const channelPromises = channelsToLoad.map(async (stream) => {
                const streamId = String(stream.id);

                try {
                    const epgData = await getShortEPG(streamId);

                    // Convert to EPGProgram format
                    const programs: EPGProgram[] = epgData.map((item: XtreamEPGListingItem) =>
                        convertXtreamToEPGProgram(item)
                    );

                    return {
                        streamId,
                        name: stream.name,
                        icon: stream.icon || '',
                        programs: programs.sort((a, b) => a.startTimestamp - b.startTimestamp)
                    };
                } catch (err) {
                    console.error(`Failed to load EPG for channel ${streamId}:`, err);
                    return {
                        streamId,
                        name: stream.name,
                        icon: stream.icon || '',
                        programs: []
                    };
                }
            });

            const channelsData = await Promise.all(channelPromises);

            // Filter out channels with no EPG data
            const channelsWithEPG = channelsData.filter(c => c.programs.length > 0);

            if (channelsWithEPG.length === 0) {
                setError('Nenhum dado EPG disponível para os canais selecionados.');
            }

            setChannels(channelsWithEPG);
        } catch (err) {
            console.error('Error loading EPG:', err);
            setError('Falha ao carregar dados EPG. Verifique sua conexão.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                    <Link
                        href="/dashboard"
                        data-focusable="true"
                        tabIndex={0}
                        className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors focus:outline-none focus:text-red-500 focus:scale-110 origin-left"
                    >
                        <ArrowLeft size={20} />
                        Voltar
                    </Link>
                    <div>
                        <h1 className="text-2xl md:text-4xl font-bold text-white flex items-center gap-3">
                            <Calendar size={32} className="text-red-500" />
                            Guia de Programação
                        </h1>
                        <p className="text-gray-400 text-sm mt-1">
                            Veja a programação de todos os canais ao vivo
                        </p>
                    </div>
                </div>

                {/* Category Filter */}
                {categories.length > 0 && (
                    <div className="flex items-center gap-2">
                        <Filter size={16} className="text-gray-400" />
                        <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="bg-[#1f1f1f] border border-[#333] rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
                        >
                            <option value="all">Todas as Categorias</option>
                            {categories.map((cat) => (
                                <option key={cat.category_id} value={cat.category_id}>
                                    {cat.category_name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Info Banner */}
            <div className="bg-blue-600/10 border border-blue-600/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                    <Calendar size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                        <h3 className="text-white font-semibold mb-1">Sobre o EPG</h3>
                        <p className="text-gray-300 text-sm">
                            O Guia de Programação Eletrônica (EPG) exibe a programação dos canais de TV ao vivo.
                            Clique em qualquer canal ou programa para assistir ao vivo.
                        </p>
                    </div>
                </div>
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader />
                </div>
            ) : error ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <Calendar size={48} className="text-gray-600 mb-4" />
                    <h3 className="text-xl font-bold text-white mb-2">Erro ao Carregar EPG</h3>
                    <p className="text-gray-400 max-w-md mb-6">{error}</p>
                    <button
                        onClick={loadEPGData}
                        className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg text-white font-medium transition-colors"
                    >
                        Tentar Novamente
                    </button>
                </div>
            ) : (
                <EPGGrid channels={channels} />
            )}

            {/* Stats */}
            {!loading && !error && channels.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-[#1a1a1a] rounded-lg p-4 border border-[#333]">
                        <p className="text-gray-400 text-sm mb-1">Canais com EPG</p>
                        <p className="text-2xl font-bold text-white">{channels.length}</p>
                    </div>
                    <div className="bg-[#1a1a1a] rounded-lg p-4 border border-[#333]">
                        <p className="text-gray-400 text-sm mb-1">Total de Programas</p>
                        <p className="text-2xl font-bold text-white">
                            {channels.reduce((sum, ch) => sum + ch.programs.length, 0)}
                        </p>
                    </div>
                    <div className="bg-[#1a1a1a] rounded-lg p-4 border border-[#333]">
                        <p className="text-gray-400 text-sm mb-1">Categoria</p>
                        <p className="text-2xl font-bold text-white truncate">
                            {selectedCategory === 'all'
                                ? 'Todas'
                                : categories.find(c => c.category_id === selectedCategory)?.category_name || 'N/A'}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
