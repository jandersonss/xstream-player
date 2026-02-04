'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/app/context/AuthContext';
import { useFavorites } from '@/app/context/FavoritesContext';
import VideoPlayer from '@/components/VideoPlayer';
import { useWatchProgress } from '@/app/context/WatchProgressContext';
import { ArrowLeft, Play, Calendar, Star, Clock, List, Heart } from 'lucide-react';
import Loader from '@/components/Loader';

// Types
interface Episode {
    id: string;
    episode_num: string | number;
    title: string;
    container_extension: string;
    info: any;
    custom_sid: string;
    added: string;
    season: number | string;
    direct_source: string;
}

interface SeriesInfo {
    info: {
        name: string;
        cover: string;
        plot: string;
        cast: string;
        director: string;
        genre: string;
        releaseDate: string;
        rating: string;
        backdrop_path: string[];
    };
    episodes: {
        [key: string]: Episode[];
    };
}

import { useData } from '@/app/context/DataContext';

export default function WatchSeriesPage() {
    const { credentials } = useAuth();
    const { isFavorite, addFavorite, removeFavorite } = useFavorites();
    const { updateProgress, getProgress } = useWatchProgress();
    const { getCachedDetail, saveCachedDetail } = useData();
    const params = useParams();
    const router = useRouter();
    const seriesId = params.seriesId as string;

    const [series, setSeries] = useState<SeriesInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [activeSeason, setActiveSeason] = useState<string>("1");
    const [resumeTime, setResumeTime] = useState(0);

    useEffect(() => {
        if (!credentials || !seriesId) return;

        const loadSeriesInfo = async () => {
            try {
                // Try cache first
                const cached = await getCachedDetail(seriesId);
                if (cached) {
                    setSeries(cached);
                    // Set initial season if available
                    const seasons = Object.keys(cached.episodes || {});
                    if (seasons.length > 0) {
                        setActiveSeason(seasons[0]);
                    }
                    setLoading(false);
                    return;
                }

                const res = await fetch('/api/proxy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...credentials,
                        action: 'get_series_info',
                        series_id: seriesId
                    })
                });

                const data = await res.json();
                if (data && data.info) {
                    setSeries(data);
                    // Lazy cache the detail
                    await saveCachedDetail(seriesId, data);

                    const seasons = Object.keys(data.episodes || {});
                    if (seasons.length > 0) {
                        setActiveSeason(seasons[0]);
                    }
                } else {
                    setError("Detalhes da série não encontrados.");
                }
            } catch (err) {
                console.error(err);
                setError("Falha ao carregar detalhes da série.");
            } finally {
                setLoading(false);
            }
        };

        loadSeriesInfo();
    }, [credentials, seriesId, getCachedDetail, saveCachedDetail]);

    // Check progress for episode when selected
    useEffect(() => {
        if (selectedEpisode) {
            const progress = getProgress(selectedEpisode.id);
            if (progress && progress.progress > 10) {
                setResumeTime(progress.progress);
            } else {
                setResumeTime(0);
            }
        }
    }, [selectedEpisode, getProgress]);

    // Auto-play from continue watching
    const searchParams = useSearchParams();
    useEffect(() => {
        if (searchParams.get('autoplay') === 'true' && series && !selectedEpisode) {
            const episodeId = searchParams.get('episode');
            console.log('[Series Auto-play] Looking for episode:', episodeId);

            if (episodeId && episodeId !== '') {
                // Find the episode by ID
                let foundEpisode = null;
                let foundSeason = null;

                for (const season in series.episodes) {
                    const episode = series.episodes[season].find(ep => String(ep.id) === String(episodeId));
                    if (episode) {
                        foundEpisode = episode;
                        foundSeason = season;
                        console.log('[Series Auto-play] Found episode:', episode.title, 'in season:', season);
                        break;
                    }
                }

                if (foundEpisode && foundSeason) {
                    setActiveSeason(foundSeason);
                    setSelectedEpisode(foundEpisode);
                } else {
                    console.warn('[Series Auto-play] Episode not found, using first episode of first season');
                    // Fallback: use first episode of first season
                    const firstSeason = Object.keys(series.episodes)[0];
                    if (firstSeason && series.episodes[firstSeason].length > 0) {
                        setActiveSeason(firstSeason);
                        setSelectedEpisode(series.episodes[firstSeason][0]);
                    }
                }
            } else {
                console.log('[Series Auto-play] No episode ID provided, using first episode');
                // No episode ID, use first episode of first season
                const firstSeason = Object.keys(series.episodes)[0];
                if (firstSeason && series.episodes[firstSeason].length > 0) {
                    setActiveSeason(firstSeason);
                    setSelectedEpisode(series.episodes[firstSeason][0]);
                }
            }
        }
    }, [searchParams, series, selectedEpisode]);

    const handleProgress = (currentTime: number, duration: number) => {
        if (!series || !selectedEpisode) return;
        updateProgress({
            streamId: selectedEpisode.id, // We use episode ID as the primary key for progress
            type: 'series',
            progress: currentTime,
            duration: duration,
            timestamp: Date.now(),
            name: `${series.info.name} - Ep ${selectedEpisode.episode_num}`,
            image: series.info.cover,
            episodeId: selectedEpisode.id,
            seriesId: seriesId,
            seasonNum: Number(selectedEpisode.season),
            episodeNum: Number(selectedEpisode.episode_num)
        });
    };

    if (loading) return <Loader />;

    if (error || !series) {
        return (
            <div className="min-h-screen bg-[#141414] flex flex-col items-center justify-center text-white space-y-4">
                <p className="text-red-500 text-xl">{error || 'Série não encontrada'}</p>
                <button onClick={() => router.back()} className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20">
                    <ArrowLeft size={20} /> Voltar
                </button>
            </div>
        );
    }

    if (selectedEpisode) {
        const { hostUrl, username, password } = credentials!;
        const extension = selectedEpisode.container_extension;
        const streamUrl = `${hostUrl}/series/${username}/${password}/${selectedEpisode.id}.${extension}`;

        // Navigation logic
        const allEpisodes: Episode[] = [];
        Object.keys(series.episodes)
            .sort((a, b) => Number(a) - Number(b))
            .forEach(season => {
                allEpisodes.push(...series.episodes[season]);
            });

        const currentIndex = allEpisodes.findIndex(e => e.id === selectedEpisode.id);
        const hasNext = currentIndex < allEpisodes.length - 1;
        const hasPrevious = currentIndex > 0;

        const playNext = () => {
            if (hasNext) {
                setSelectedEpisode(allEpisodes[currentIndex + 1]);
            }
        };

        const playPrevious = () => {
            if (hasPrevious) {
                setSelectedEpisode(allEpisodes[currentIndex - 1]);
            }
        };

        return (
            <div className="fixed inset-0 bg-black z-50 flex flex-col">
                <div className="relative flex-1 flex items-center justify-center">
                    <VideoPlayer
                        src={streamUrl}
                        poster={series.info.cover}
                        autoPlay={true}
                        initialTime={resumeTime}
                        onProgress={handleProgress}
                        onNext={hasNext ? playNext : undefined}
                        onPrevious={hasPrevious ? playPrevious : undefined}
                        hasNext={hasNext}
                        hasPrevious={hasPrevious}
                        enterFullscreen={true}
                        onBack={() => setSelectedEpisode(null)}
                    />
                </div>
            </div>
        );
    }

    const seasons = Object.keys(series.episodes || {}).sort((a, b) => Number(a) - Number(b));
    const currentEpisodes = series.episodes[activeSeason] || [];

    return (
        <div className="min-h-screen bg-[#141414] text-white">
            {/* Background Backdrop */}
            <div className="absolute inset-0 overflow-hidden h-[60vh]">
                <div
                    className="absolute inset-0 bg-cover bg-top blur-sm opacity-40 scale-105"
                    style={{ backgroundImage: `url(${series.info.cover})` }}
                ></div>
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#141414]/90 to-[#141414]"></div>
            </div>

            <div className="relative z-10 container mx-auto px-6 pt-20 pb-12">
                <button
                    onClick={() => router.back()}
                    data-focusable="true"
                    tabIndex={0}
                    className="mb-8 flex items-center gap-2 text-gray-300 hover:text-white transition-colors focus:outline-none focus:text-red-500 focus:scale-110 origin-left"
                >
                    <ArrowLeft size={24} /> Voltar
                </button>

                <div className="flex flex-col lg:flex-row gap-10 lg:gap-16 items-start mb-16">
                    {/* Poster */}
                    <div className="w-full max-w-[250px] lg:max-w-[350px] flex-shrink-0 rounded-xl overflow-hidden shadow-2xl shadow-black/50 mx-auto lg:mx-0">
                        <img
                            src={series.info.cover}
                            alt={series.info.name}
                            className="w-full h-auto"
                            onError={(e) => e.currentTarget.src = 'https://via.placeholder.com/300x450?text=Sem+Capa'}
                        />
                    </div>

                    {/* Metadata */}
                    <div className="flex-1 space-y-6">
                        <h1 className="text-4xl lg:text-6xl font-bold leading-tight">{series.info.name}</h1>

                        <div className="flex flex-wrap items-center gap-4 text-sm lg:text-base text-gray-300">
                            {series.info.releaseDate && (
                                <span className="flex items-center gap-1 bg-white/10 px-3 py-1 rounded-full">
                                    <Calendar size={16} /> {series.info.releaseDate}
                                </span>
                            )}
                            {series.info.rating && (
                                <span className="flex items-center gap-1 bg-yellow-500/20 text-yellow-500 px-3 py-1 rounded-full border border-yellow-500/30">
                                    <Star size={16} fill="currentColor" /> {series.info.rating}
                                </span>
                            )}
                        </div>

                        <p className="text-lg text-gray-300 leading-relaxed max-w-3xl">
                            {series.info.plot || "Nenhuma sinopse disponível."}
                        </p>

                        <div className="flex gap-4 mt-8">
                            <button
                                onClick={() => {
                                    const id = seriesId;
                                    if (isFavorite(id, 'series')) {
                                        removeFavorite(id, 'series');
                                    } else {
                                        addFavorite({
                                            id: id,
                                            type: 'series',
                                            name: series.info.name,
                                            image: series.info.cover,
                                            rating: series.info.rating
                                        });
                                    }
                                }}
                                data-focusable="true"
                                tabIndex={0}
                                className={`flex items-center gap-2 px-6 py-3 rounded-full border transition-all focus:outline-none focus:ring-4 focus:ring-white ${isFavorite(seriesId, 'series')
                                    ? 'bg-white text-red-600 border-white font-bold'
                                    : 'bg-transparent text-white border-white/30 hover:bg-white/10'
                                    }`}
                            >
                                <Heart size={20} fill={isFavorite(seriesId, 'series') ? "currentColor" : "none"} />
                                {isFavorite(seriesId, 'series') ? 'Favoritado' : 'Adicionar aos Favoritos'}
                            </button>
                        </div>

                        <div className="space-y-2 text-gray-400">
                            <p><strong className="text-white">Gênero:</strong> {series.info.genre}</p>
                            <p><strong className="text-white">Elenco:</strong> {series.info.cast}</p>
                        </div>
                    </div>
                </div>

                {/* Episodes Section */}
                <div className="space-y-6">
                    <div className="flex items-center gap-4 overflow-x-auto pb-4 scrollbar-hide border-b border-white/10">
                        {seasons.map(season => (
                            <button
                                key={season}
                                onClick={() => setActiveSeason(season)}
                                data-focusable="true"
                                tabIndex={0}
                                className={`px-6 py-2 rounded-full font-bold whitespace-nowrap transition-all focus:outline-none focus:ring-4 focus:ring-white ${activeSeason === season
                                    ? 'bg-red-600 text-white'
                                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                                    }`}
                            >
                                Temporada {season}
                            </button>
                        ))}
                    </div>

                    <div className="grid gap-4">
                        {currentEpisodes.map((ep) => (
                            <button
                                key={ep.id}
                                type="button"
                                onClick={() => setSelectedEpisode(ep)}
                                data-focusable="true"
                                tabIndex={0}
                                className="flex items-center gap-4 p-4 bg-[#1f1f1f] rounded-xl hover:bg-[#2a2a2a] transition-all cursor-pointer group border border-white/5 hover:border-red-500/30 focus:outline-none focus:ring-4 focus:ring-red-600 focus:scale-[1.02] z-10 w-full text-left"
                            >
                                <div className="w-12 h-12 flex items-center justify-center bg-white/10 rounded-full group-hover:bg-red-600 transition-colors flex-shrink-0">
                                    <Play size={20} fill="currentColor" className="text-white ml-1" />
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-bold text-lg text-white group-hover:text-red-400 transition-colors">
                                        {ep.episode_num}. {ep.title}
                                    </h4>
                                    {ep.info && ep.info.releasedate && <p className="text-sm text-gray-500">{ep.info.releasedate}</p>}
                                </div>
                                <div className="text-xs text-gray-500 bg-black/30 px-2 py-1 rounded">
                                    {ep.container_extension}
                                </div>
                            </button>
                        ))}
                        {currentEpisodes.length === 0 && (
                            <p className="text-gray-500">Nenhum episódio encontrado para esta temporada.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
