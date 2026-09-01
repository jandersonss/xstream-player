'use client';

import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useWatchProgress } from '../context/WatchProgressContext';
import { useTMDb } from '../context/TMDbContext';
import { useSubtitle } from '../context/SubtitleContext';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Play, Tv, Film, Layers, Clock, Calendar, User, Settings, Star, TrendingUp, Subtitles, Wifi } from 'lucide-react';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useAccountStatus } from '@/app/hooks/useAccountStatus';
import ContentCarousel from '@/components/ContentCarousel';
import { apiFetch } from '@/app/lib/apiClient';
import HeroSection from '@/components/HeroSection';
import TMDbSettingsModal from '@/components/TMDbSettingsModal';
import SubtitleSettingsModal from '@/components/SubtitleSettingsModal';
import CardGrid from '@/components/CardGrid';

interface CarouselItemData {
    id: string | number;
    name: string;
    image: string;
    rating?: number | string;
    year?: number;
    type: 'movie' | 'series';
}

export default function Dashboard() {
    const { user, server } = useAuth();
    const { lastSync } = useData();
    const { progressMap } = useWatchProgress();
    const { isConfigured } = useTMDb();
    const {
        isConfigured: isSubtitleConfigured,
        isConfigResolved: isSubtitleConfigResolved,
        ensureConfigLoaded: ensureSubtitleConfigLoaded,
    } = useSubtitle();

    const account = useAccountStatus();
    const isAccountActive = user?.status === 'Active';
    const [showSettings, setShowSettings] = useState(false);
    const [showSubtitleSettings, setShowSubtitleSettings] = useState(false);
    interface CarouselData {
        id: string;
        title: string;
        type: 'movie' | 'series';
        data: CarouselItemData[];
        categoryId?: string | number;
    }

    const [carouselData, setCarouselData] = useState<CarouselData[]>([]);
    const [isLoadingCarousels, setIsLoadingCarousels] = useState(false);
    const router = useRouter();

    // Progressive reveal: only the first 3 carousels render on mount; the rest
    // reveal in batches as the sentinel scrolls into view. Falls back to a
    // manual button so carousels stay reachable even when IntersectionObserver
    // is the no-op polyfill from app/polyfills.ts (older WebOS browsers).
    const CAROUSEL_BATCH_SIZE = 3;
    const [visibleCarouselCount, setVisibleCarouselCount] = useState(CAROUSEL_BATCH_SIZE);
    const carouselSentinelRef = useRef<HTMLDivElement | null>(null);
    const visibleCarousels = carouselData.slice(0, visibleCarouselCount);
    const hasMoreCarousels = visibleCarouselCount < carouselData.length;

    useEffect(() => {
        setVisibleCarouselCount(CAROUSEL_BATCH_SIZE);
    }, [carouselData]);

    useEffect(() => {
        const sentinel = carouselSentinelRef.current;
        if (!sentinel || typeof IntersectionObserver === 'undefined') return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisibleCarouselCount(prev => Math.min(prev + CAROUSEL_BATCH_SIZE, carouselData.length));
                }
            },
            { threshold: 0.1 }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMoreCarousels, carouselData.length, visibleCarouselCount]);

    const continueWatching = useMemo(() => {
        return Object.values(progressMap)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 10)
            .map(item => ({
                id: item.streamId,
                name: item.name,
                image: item.image || 'https://via.placeholder.com/300x169?text=Sem+Capa',
                progress: item.progress,
                duration: item.duration,
                href: item.type === 'movie'
                    ? `/dashboard/watch/movie/${item.streamId}?autoplay=true`
                    : `/dashboard/watch/series/${item.seriesId || item.streamId}?autoplay=true&episode=${item.episodeId || ''}`
            }));
    }, [progressMap]);

    // The subtitle config loads lazily, so the header badge needs it resolved
    // without waiting for the modal to be opened.
    useEffect(() => {
        ensureSubtitleConfigLoaded();
    }, [ensureSubtitleConfigLoaded]);

    // Load carousels from backend
    useEffect(() => {
        const loadCarousels = async () => {
            setIsLoadingCarousels(true);
            try {
                const response = await apiFetch('/api/catalog/carousels');
                if (!response.ok) throw new Error('Failed to fetch carousels');
                const result = await response.json();
                setCarouselData(result.data || []);
            } catch (error) {
                console.error('Failed to load carousels:', error);
            } finally {
                setIsLoadingCarousels(false);
            }
        };

        loadCarousels();
    }, [isConfigured, lastSync]);

    const formatDate = (timestamp: string) => {
        if (!timestamp) return 'Ilimitado';
        const date = new Date(parseInt(timestamp) * 1000);
        return date.toLocaleDateString();
    };

    const getCarouselIcon = (carouselId: string) => {
        if (carouselId.includes('trending')) return TrendingUp;
        if (carouselId.includes('movie') || carouselId.startsWith('new-releases')) return Film;
        if (carouselId.includes('tv') || carouselId.includes('series')) return Layers;
        return Play;
    };

    return (
        <>
            {/* Hero & Header Container */}
            < div className="relative w-full" > {/* Negative margin to pull up if needed, or remove padding from parent if possible. Assuming parent has padding. */}

                {/* Header Section - Overlay */}
                <div className="absolute top-0 left-0 right-0 z-50 flex flex-row justify-between items-center px-4 py-6 md:px-12 md:py-10 bg-gradient-to-b from-black/90 via-black/40 to-transparent">
                    <div className="flex items-center drop-shadow-md">
                        <span className="text-xl md:text-2xl font-black text-red-600 tracking-tighter leading-none">X</span>
                        <span className="text-xl md:text-2xl font-black text-white tracking-tighter leading-none">stream</span>
                    </div>
                    <div className="flex items-center space-x-2 md:space-x-3">
                        <button
                            onClick={() => setShowSettings(true)}
                            data-focusable="true"
                            className="bg-black/30 hover:bg-black/50  px-2.5 py-1 rounded-full border border-white/5 hover:border-red-500/50 flex items-center space-x-1.5 transition-all group"
                        >
                            <Settings size={12} className="text-gray-400 group-hover:text-white transition-colors" />
                            <span className="font-medium text-[10px] md:text-xs text-gray-300">TMDb</span>
                            {isConfigured && <span className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_5px_rgba(34,197,94,0.5)]"></span>}
                        </button>

                        <button
                            onClick={() => setShowSubtitleSettings(true)}
                            data-focusable="true"
                            className="bg-black/30 hover:bg-black/50  px-2.5 py-1 rounded-full border border-white/5 hover:border-emerald-500/50 flex items-center space-x-1.5 transition-all group"
                        >
                            <Subtitles size={12} className="text-gray-400 group-hover:text-white transition-colors" />
                            <span className="font-medium text-[10px] md:text-xs text-gray-300">Legendas</span>
                            {isSubtitleConfigResolved && isSubtitleConfigured && <span className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_5px_rgba(34,197,94,0.5)]"></span>}
                        </button>

                        <div className={`bg-black/30 px-2.5 py-1 rounded-full border flex items-center space-x-1.5 text-[10px] md:text-xs text-white hidden sm:flex ${isAccountActive ? 'border-green-500/40' : 'border-white/5'}`}>
                            <User size={12} />
                            <span>{user?.username}</span>
                            <span className="text-white/30">|</span>
                            <Calendar size={12} />
                            <span>{user?.exp_date ? formatDate(user.exp_date) : 'N/A'}</span>
                            <span className="text-white/30">|</span>
                            <Wifi size={12} />
                            <span>{account ? `${account.activeConnections}/${account.maxConnections}` : '—'}</span>
                            <span className={`w-1.5 h-1.5 rounded-full ${isAccountActive ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]' : 'bg-gray-500'}`}></span>
                        </div>
                    </div>
                </div>

                {/* Hero Section */}
                <HeroSection />
            </div >
            <div className="p-4 md:p-6 lg:p-10">

                {/* Continue Watching Section */}
                {
                    continueWatching.length > 0 && (
                        <ContentCarousel
                            title="Continuar Assistindo"
                            items={continueWatching}
                            icon={Clock}
                            showProgress={true}
                        />
                    )
                }

                {/* Dynamic Carousels */}
                {
                    visibleCarousels.map((carousel) => {
                        const items = carousel.data.map(item => ({
                            ...item,
                            href: item.type === 'movie'
                                ? `/dashboard/watch/movie/${item.id}`
                                : `/dashboard/watch/series/${item.id}`
                        }));

                        return (
                            <ContentCarousel
                                key={carousel.id}
                                title={carousel.title}
                                items={items}
                                icon={getCarouselIcon(carousel.id)}
                                onViewAll={carousel.categoryId ? () => {
                                    router.push(`/dashboard/${carousel.type === 'movie' ? 'movies' : 'series'}/${carousel.categoryId}`);
                                } : undefined}
                            />
                        );
                    })
                }

                {/* Sentinel to progressively reveal remaining carousels; button is a fallback
                    for browsers where IntersectionObserver is a no-op polyfill (see app/polyfills.ts) */}
                {
                    hasMoreCarousels && (
                        <div ref={carouselSentinelRef} className="flex justify-center py-4">
                            <button
                                data-focusable="true"
                                onClick={() => setVisibleCarouselCount(prev => Math.min(prev + CAROUSEL_BATCH_SIZE, carouselData.length))}
                                className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-[#333] rounded-lg transition-colors"
                            >
                                Carregar mais categorias
                            </button>
                        </div>
                    )
                }

                {/* Main Categories Cards */}
                {/* The outer div keeps mt-6/mb-6 off CardGrid, whose own negative
                    gutter margins would collide with them */}
                <div className="mt-6 mb-6">
                    <CardGrid base={1} md={3} gap={6}>
                        <Link
                            href="/dashboard/live"
                            data-focusable="true"
                            tabIndex={0}
                            className="group relative h-64 rounded-2xl overflow-hidden cursor-pointer border border-[#333] hover:border-red-600 transition-all shadow-xl hover:shadow-red-900/20 focus:outline-none focus:ring-4 focus:ring-red-600 focus:scale-105 z-10"
                        >
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent z-10"></div>
                            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?q=80&w=640&auto=format&fit=crop')] bg-cover bg-center transition-transform duration-700 group-hover:scale-110"></div>

                            <div className="absolute bottom-0 left-0 p-6 z-20 w-full">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="p-3 bg-red-600 rounded-full group-hover:scale-110 transition-transform">
                                        <Tv size={24} className="text-white" />
                                    </div>
                                    <span className="text-xs font-bold bg-white/20  px-2 py-1 rounded text-white uppercase tracking-wider">Transmissão ao Vivo</span>
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-1">TV ao Vivo</h3>
                                <p className="text-gray-300 text-sm line-clamp-1">Assista seus canais favoritos ao vivo.</p>
                            </div>
                        </Link>

                        <Link
                            href="/dashboard/movies"
                            data-focusable="true"
                            tabIndex={0}
                            className="group relative h-64 rounded-2xl overflow-hidden cursor-pointer border border-[#333] hover:border-red-600 transition-all shadow-xl hover:shadow-red-900/20 focus:outline-none focus:ring-4 focus:ring-red-600 focus:scale-105 z-10"
                        >
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent z-10"></div>
                            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=640&auto=format&fit=crop')] bg-cover bg-center transition-transform duration-700 group-hover:scale-110"></div>

                            <div className="absolute bottom-0 left-0 p-6 z-20 w-full">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="p-3 bg-blue-600 rounded-full group-hover:scale-110 transition-transform">
                                        <Film size={24} className="text-white" />
                                    </div>
                                    <span className="text-xs font-bold bg-white/20  px-2 py-1 rounded text-white uppercase tracking-wider">On Demand</span>
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-1">Filmes</h3>
                                <p className="text-gray-300 text-sm line-clamp-1">Últimos lançamentos e clássicos.</p>
                            </div>
                        </Link>

                        <Link
                            href="/dashboard/series"
                            data-focusable="true"
                            tabIndex={0}
                            className="group relative h-64 rounded-2xl overflow-hidden cursor-pointer border border-[#333] hover:border-red-600 transition-all shadow-xl hover:shadow-red-900/20 focus:outline-none focus:ring-4 focus:ring-red-600 focus:scale-105 z-10"
                        >
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent z-10"></div>
                            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?q=80&w=640&auto=format&fit=crop')] bg-cover bg-center transition-transform duration-700 group-hover:scale-110"></div>

                            <div className="absolute bottom-0 left-0 p-6 z-20 w-full">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="p-3 bg-purple-600 rounded-full group-hover:scale-110 transition-transform">
                                        <Layers size={24} className="text-white" />
                                    </div>
                                    <span className="text-xs font-bold bg-white/20  px-2 py-1 rounded text-white uppercase tracking-wider">Maratonar</span>
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-1">Séries</h3>
                                <p className="text-gray-300 text-sm line-clamp-1">Programas de TV e episódios.</p>
                            </div>
                        </Link>
                    </CardGrid>
                </div>

                {/* Account Details */}
                <CardGrid base={1} lg={2} gap={6}>
                    <div className="bg-[#1a1a1a] rounded-xl p-6 border border-[#333]">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center space-x-2">
                            <Clock size={18} className="text-gray-400" />
                            Detalhes da Conta
                        </h3>
                        <div className="space-y-4">
                            <div className="flex justify-between border-b border-[#333] pb-2">
                                <span className="text-gray-400">Conexões Máximas</span>
                                <span className="text-white font-medium">{user?.max_connections}</span>
                            </div>
                            <div className="flex justify-between border-b border-[#333] pb-2">
                                <span className="text-gray-400">Conexões Ativas</span>
                                <span className="text-white font-medium">{user?.active_cons}</span>
                            </div>
                            <div className="flex justify-between border-b border-[#333] pb-2">
                                <span className="text-gray-400">URL</span>
                                <span className="text-white font-medium truncate max-w-[200px]">{server?.url}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Fuso Horário</span>
                                <span className="text-white font-medium">{server?.timezone}</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-[#1a1a1a] to-[#222] rounded-xl p-6 border border-[#333] flex flex-col items-center justify-center text-center">
                        <div className="w-16 h-16 bg-[#333] rounded-full flex items-center justify-center mb-4">
                            {isConfigured ? (
                                <Star size={32} className="text-yellow-500" />
                            ) : (
                                <Tv size={32} className="text-gray-500" />
                            )}
                        </div>
                        <h3 className="text-white font-bold mb-2">
                            {isConfigured ? 'Experiência TMDb Ativa' : 'Configure o TMDb'}
                        </h3>
                        <p className="text-gray-400 text-sm">
                            {isConfigured
                                ? 'Carrosséis personalizados com conteúdos do TMDb disponíveis no seu IPTV.'
                                : 'Configure sua chave de API para ver sugestões do TMDb filtradas pelo seu catálogo.'}
                        </p>
                        {!isConfigured && (
                            <button
                                onClick={() => setShowSettings(true)}
                                className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white text-sm font-medium transition-colors"
                            >
                                Configurar Agora
                            </button>
                        )}
                    </div>
                </CardGrid>

                {/* TMDb Settings Modal */}
                <TMDbSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

                {/* Subtitle Settings Modal */}
                <SubtitleSettingsModal isOpen={showSubtitleSettings} onClose={() => setShowSubtitleSettings(false)} />
            </div>
        </>
    );
}
