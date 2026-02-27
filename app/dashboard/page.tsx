'use client';

import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useWatchProgress } from '../context/WatchProgressContext';
import { useTMDb } from '../context/TMDbContext';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Play, Tv, Film, Layers, Clock, Calendar, User, Settings, Star, TrendingUp } from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import ContentCarousel from '@/components/ContentCarousel';
import HeroSection from '@/components/HeroSection';
import TMDbSettingsModal from '@/components/TMDbSettingsModal';
import {
    getTMDbImageUrl,
    getDailySeed,
    shuffleWithSeed,
    generateDailyCarousels,
    titlesMatch,
    findBestMatch,
    prepareForMatching,
    TMDbMovie,
    TMDbTVShow
} from '../lib/tmdb';
import {
    CachedStream,
    CachedCategory,
    saveCarouselCache,
    getCarouselCache,
    clearExpiredCarouselCache
} from '../lib/db';
import { div } from 'framer-motion/client';

interface EnrichedStream extends CachedStream {
    tmdbData?: {
        poster: string;
        backdrop: string;
        rating: number;
        overview: string;
        year: number;
    };
}

export default function Dashboard() {
    const { user, server } = useAuth();
    const { lastSync, getCachedCategories, getAllCachedStreams } = useData();
    const { progressMap } = useWatchProgress();
    const {
        isConfigured,
        fetchMovieGenres,
        fetchTVGenres,
        fetchMoviesByYear,
        fetchMoviesByGenre,
        fetchTVByGenre,
        fetchTrending
    } = useTMDb();

    const [greeting, setGreeting] = useState('Welcome back');
    const [showSettings, setShowSettings] = useState(false);
    interface CarouselData {
        id: string;
        title: string;
        type: 'movie' | 'series';
        data: EnrichedStream[];
        categoryId?: string | number;
    }

    const [carouselData, setCarouselData] = useState<CarouselData[]>([]);
    const [isLoadingCarousels, setIsLoadingCarousels] = useState(false);
    const router = useRouter();

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

    useEffect(() => {
        const hour = new Date().getHours();
        if (hour < 12) setGreeting('Bom dia');
        else if (hour < 18) setGreeting('Boa tarde');
        else setGreeting('Boa noite');
    }, []);

    // Load carousels based on TMDb configuration
    // Load carousels based on TMDb configuration
    useEffect(() => {
        const loadCarousels = async () => {
            setIsLoadingCarousels(true);
            const allCarousels: CarouselData[] = [];

            try {
                // Always load IPTV carousels
                const iptvCarousels = await fetchIPTVCarousels();
                allCarousels.push(...iptvCarousels);

                if (isConfigured) {
                    // TMDb configured: Load TMDB carousels filtered by IPTV availability
                    const tmdbCarousels = await fetchTMDbCarousels();
                    allCarousels.unshift(...tmdbCarousels);
                }

                setCarouselData(allCarousels);
            } catch (error) {
                console.error('Failed to load carousels:', error);
            } finally {
                setIsLoadingCarousels(false);
            }
        };

        loadCarousels();
    }, [isConfigured, lastSync]);

    const fetchTMDbCarousels = async (): Promise<CarouselData[]> => {
        // Daily cache key (YYYY-MM-DD)
        const today = new Date();
        const dateKey = today.toISOString().split('T')[0];

        // Check cache first
        try {
            const cachedData = await getCarouselCache(dateKey);
            if (cachedData && cachedData.length > 0) {
                console.log('Using cached carousels for', dateKey);
                // Clean up old caches in background
                clearExpiredCarouselCache(dateKey).catch(console.error);
                return cachedData;
            }
        } catch (error) {
            console.warn('Failed to read carousel cache:', error);
        }

        // Get all IPTV content for matching
        const [allMovies, allSeries] = await Promise.all([
            getAllCachedStreams('movie'),
            getAllCachedStreams('series')
        ]);

        // OPTIMIZATION: Prepare databases for matching (normalize once)
        console.time('prepareMatching');
        const preparedMovies = prepareForMatching(allMovies);
        const preparedSeries = prepareForMatching(allSeries);
        console.timeEnd('prepareMatching');

        // Fetch genres
        const [movieGenres, tvGenres] = await Promise.all([
            fetchMovieGenres(),
            fetchTVGenres()
        ]);

        // Generate daily carousels
        const carousels = generateDailyCarousels(movieGenres, tvGenres, 4);

        // Fetch and filter TMDb content
        const dataPromises = carousels.map(async (carousel) => {
            let tmdbItems: (TMDbMovie | TMDbTVShow)[] = [];

            try {
                if (carousel.type === 'trending') {
                    tmdbItems = await fetchTrending();
                } else if (carousel.type === 'movie') {
                    if (carousel.year) {
                        tmdbItems = await fetchMoviesByYear(carousel.year);
                    } else if (carousel.genreId) {
                        tmdbItems = await fetchMoviesByGenre(carousel.genreId);
                    }
                } else if (carousel.type === 'tv' && carousel.genreId) {
                    tmdbItems = await fetchTVByGenre(carousel.genreId);
                }
            } catch (error) {
                console.error(`Failed to fetch TMDb data for ${carousel.id}:`, error);
                return {
                    id: carousel.id,
                    title: carousel.title,
                    type: carousel.type === 'tv' ? 'series' as const : 'movie' as const,
                    data: [] as EnrichedStream[]
                };
            }

            // Filter TMDb items to only those available in IPTV
            const filteredItems: EnrichedStream[] = [];
            const matchedStreamIds = new Set<number | string>(); // Track matched items to avoid duplicates

            for (const tmdbItem of tmdbItems) {
                // Determine the correct database and type for THIS item
                // This fixes the issue where trending (mixed) items were all searched in movies DB
                let isMovie = false;
                if (carousel.type === 'trending') {
                    // For trending, check the media_type if available or infer from title
                    isMovie = 'title' in tmdbItem;
                } else {
                    // For specific carousels, use the carousel type
                    isMovie = carousel.type === 'movie';
                }

                // If trending item is a 'person' or other type, skip
                if (!('title' in tmdbItem) && !('name' in tmdbItem)) continue;

                // Select correct PREPARED DB
                const preparedDatabase = isMovie ? preparedMovies : preparedSeries;
                const tmdbTitle = isMovie ? (tmdbItem as TMDbMovie).title : (tmdbItem as TMDbTVShow).name;

                // Find BEST matching IPTV item using prepared DB
                const matchResult = findBestMatch<EnrichedStream>(tmdbTitle, preparedDatabase, 0.85);

                if (matchResult && !matchedStreamIds.has(matchResult.item.id)) {
                    const iptvMatch = matchResult.item;

                    // Mark this stream as matched
                    matchedStreamIds.add(iptvMatch.id);

                    filteredItems.push({
                        ...iptvMatch,
                        tmdbData: {
                            poster: getTMDbImageUrl(tmdbItem.poster_path),
                            backdrop: getTMDbImageUrl(tmdbItem.backdrop_path),
                            rating: tmdbItem.vote_average,
                            overview: tmdbItem.overview,
                            year: isMovie
                                ? new Date((tmdbItem as TMDbMovie).release_date || '').getFullYear()
                                : new Date((tmdbItem as TMDbTVShow).first_air_date || '').getFullYear()
                        }
                    });
                }

                // Limit to 20 items per carousel
                if (filteredItems.length >= 20) break;
            }

            return {
                id: carousel.id,
                title: carousel.title,
                type: carousel.type === 'tv' ? 'series' as const : 'movie' as const,
                data: filteredItems
            };
        });

        const results = await Promise.all(dataPromises);

        // Filter out empty carousels
        const validResults = results.filter(r => r.data.length > 0);

        // Cache the results
        if (validResults.length > 0) {
            saveCarouselCache(dateKey, validResults).catch(console.error);
        }

        return validResults;
    };

    const fetchIPTVCarousels = async (): Promise<CarouselData[]> => {
        // Load categories
        const [movieCategories, seriesCategories] = await Promise.all([
            getCachedCategories('movie'),
            getCachedCategories('series')
        ]);

        // Generate daily selection (max 4 carousels)
        const seed = getDailySeed();
        const allCategories = [
            ...movieCategories.map(cat => ({ type: 'movie' as const, category: cat })),
            ...seriesCategories.map(cat => ({ type: 'series' as const, category: cat }))
        ];

        const shuffled = shuffleWithSeed(allCategories, seed);
        const selected = shuffled.slice(0, 4);

        // Load content for each category
        const dataPromises = selected.map(async ({ type, category }) => {
            const streams = await getAllCachedStreams(type);
            const categoryStreams = streams
                .filter(s => s.category_id === category.category_id)
                .slice(0, 20);

            return {
                id: `${type}-${category.category_id}`,
                title: category.category_name,
                type,
                data: categoryStreams,
                categoryId: category.category_id
            };
        });

        const results = await Promise.all(dataPromises);

        // Filter out empty carousels
        return results.filter(r => r.data.length > 0);
    };

    const formatDate = (timestamp: string) => {
        if (!timestamp) return 'Ilimitado';
        const date = new Date(parseInt(timestamp) * 1000);
        return date.toLocaleDateString();
    };

    const transformStreamToCarouselItem = (stream: EnrichedStream, type: 'movie' | 'series') => {
        return {
            id: stream.id,
            name: stream.name,
            image: stream.tmdbData?.poster || stream.icon || 'https://via.placeholder.com/300x450?text=Sem+Poster',
            rating: stream.tmdbData?.rating || stream.rating,
            year: stream.tmdbData?.year,
            href: stream.type === 'movie'
                ? `/dashboard/watch/movie/${stream.id}`
                : `/dashboard/watch/series/${stream.id}`
        };
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
                    <div>
                        <h1 className="text-base md:text-xl font-bold text-white/90 drop-shadow-md flex items-center gap-2">
                            <span className="opacity-70 font-normal hidden sm:inline">{greeting},</span>
                            {user?.username}
                        </h1>
                    </div>
                    <div className="flex items-center gap-2 md:gap-3">
                        <button
                            onClick={() => setShowSettings(true)}
                            data-focusable="true"
                            className="bg-black/30 hover:bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/5 hover:border-red-500/50 flex items-center gap-1.5 transition-all group"
                        >
                            <Settings size={12} className="text-gray-400 group-hover:text-white transition-colors" />
                            <span className="font-medium text-[10px] md:text-xs text-gray-300">TMDb</span>
                            {isConfigured && <span className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_5px_rgba(34,197,94,0.5)]"></span>}
                        </button>

                        <div className="bg-black/30 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/5 flex items-center gap-1.5 text-[10px] md:text-xs text-gray-400 hidden sm:flex">
                            <User size={12} />
                            <span>{user?.status === 'Active' ? 'Ativo' : user?.status}</span>
                        </div>

                        <div className="bg-black/30 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/5 flex items-center gap-1.5 text-[10px] md:text-xs text-gray-400 hidden sm:flex">
                            <Calendar size={12} />
                            <span>{user?.exp_date ? formatDate(user.exp_date) : 'N/A'}</span>
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
                    carouselData.map((carousel) => {
                        const items = carousel.data.map(stream =>
                            transformStreamToCarouselItem(stream, carousel.type)
                        );

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

                {/* Main Categories Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 mb-6">
                    <Link
                        href="/dashboard/live"
                        data-focusable="true"
                        tabIndex={0}
                        className="group relative h-64 rounded-2xl overflow-hidden cursor-pointer border border-[#333] hover:border-red-600 transition-all shadow-xl hover:shadow-red-900/20 focus:outline-none focus:ring-4 focus:ring-red-600 focus:scale-105 z-10"
                    >
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent z-10"></div>
                        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center transition-transform duration-700 group-hover:scale-110"></div>

                        <div className="absolute bottom-0 left-0 p-6 z-20 w-full">
                            <div className="flex items-center justify-between mb-2">
                                <div className="p-3 bg-red-600 rounded-full group-hover:scale-110 transition-transform">
                                    <Tv size={24} className="text-white" />
                                </div>
                                <span className="text-xs font-bold bg-white/20 backdrop-blur-md px-2 py-1 rounded text-white uppercase tracking-wider">Transmissão ao Vivo</span>
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
                        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=2525&auto=format&fit=crop')] bg-cover bg-center transition-transform duration-700 group-hover:scale-110"></div>

                        <div className="absolute bottom-0 left-0 p-6 z-20 w-full">
                            <div className="flex items-center justify-between mb-2">
                                <div className="p-3 bg-blue-600 rounded-full group-hover:scale-110 transition-transform">
                                    <Film size={24} className="text-white" />
                                </div>
                                <span className="text-xs font-bold bg-white/20 backdrop-blur-md px-2 py-1 rounded text-white uppercase tracking-wider">On Demand</span>
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
                        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?q=80&w=2669&auto=format&fit=crop')] bg-cover bg-center transition-transform duration-700 group-hover:scale-110"></div>

                        <div className="absolute bottom-0 left-0 p-6 z-20 w-full">
                            <div className="flex items-center justify-between mb-2">
                                <div className="p-3 bg-purple-600 rounded-full group-hover:scale-110 transition-transform">
                                    <Layers size={24} className="text-white" />
                                </div>
                                <span className="text-xs font-bold bg-white/20 backdrop-blur-md px-2 py-1 rounded text-white uppercase tracking-wider">Maratonar</span>
                            </div>
                            <h3 className="text-2xl font-bold text-white mb-1">Séries</h3>
                            <p className="text-gray-300 text-sm line-clamp-1">Programas de TV e episódios.</p>
                        </div>
                    </Link>
                </div>

                {/* Account Details */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-[#1a1a1a] rounded-xl p-6 border border-[#333]">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
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
                </div>

                {/* TMDb Settings Modal */}
                <TMDbSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
            </div>
        </>
    );
}
