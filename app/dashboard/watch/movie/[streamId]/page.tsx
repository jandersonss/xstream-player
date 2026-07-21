'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/app/context/AuthContext';
import { useFavorites } from '@/app/context/FavoritesContext';
import { useWatchProgress } from '@/app/context/WatchProgressContext';
import VideoPlayer from '@/components/VideoPlayer';
import { ArrowLeft, Play, Calendar, Star, Clock, Bookmark, Subtitles, Radio } from 'lucide-react';
import Loader from '@/components/Loader';
import SubtitleSearchPanel from '@/components/SubtitleSearchPanel';
import LimitReachedModal from '@/components/LimitReachedModal';
import { useConnectionLimit } from '@/app/hooks/useConnectionLimit';
import { useShareBroadcast, useSyncPlayback, syncKey, relaySrc } from '@/app/hooks/useLiveShare';
import { useVodRelayHeartbeat } from '@/app/hooks/useVodRelayHeartbeat';
import { getAutoBroadcast } from '@/app/lib/device';
import SyncButton from '@/components/SyncButton';

// Types for Movie Info
interface MovieInfo {
    info: {
        movie_image: string;
        name: string;
        plot: string;
        director: string;
        releasedate: string;
        rating: string;
        duration: string;
        genre: string;
    };
    movie_data: {
        stream_id: number;
        container_extension: string;
        name: string;
    };
}

import { useData } from '@/app/context/DataContext';
import { useTMDb } from '@/app/context/TMDbContext';
import { useSubtitle } from '@/app/context/SubtitleContext';

export default function WatchMoviePage() {
    const { credentials } = useAuth();
    const { isFavorite, addFavorite, removeFavorite } = useFavorites();
    const { updateProgress, getProgress, isLoaded: progressLoaded, loadingDetails } = useWatchProgress();
    const { getCachedDetail, saveCachedDetail } = useData();
    const { searchMovie, isConfigured: tmdbConfigured } = useTMDb();
    const { getSavedSubtitle } = useSubtitle();
    const params = useParams();
    const router = useRouter();
    const streamId = params.streamId as string;
    const isDetailLoading = loadingDetails[`movie-${streamId}`];

    const [movie, setMovie] = useState<MovieInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);
    const [showSubtitlePanel, setShowSubtitlePanel] = useState(false);
    const [tmdbId, setTmdbId] = useState<number | undefined>(undefined);
    const [showLimitModal, setShowLimitModal] = useState(false);
    const checkConnectionLimit = useConnectionLimit();
    const [isSharing, setIsSharing] = useState(() => getAutoBroadcast());
    // "Join" (Modo TV) params — via useSearchParams to work on the client.
    const searchParams = useSearchParams();
    const isJoining = searchParams.get('join') === '1';
    const joinExt = searchParams.get('ext') || undefined;
    const joinPoster = searchParams.get('poster') || undefined;
    const joinTitle = searchParams.get('title') || undefined;

    // Time sync between players (broadcaster + viewers of the same movie).
    const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
    const { canSync, sync } = useSyncPlayback({
        videoEl,
        streamKey: syncKey('movie', streamId),
        role: isJoining ? 'viewer' : 'broadcaster',
        active: isJoining || (isPlaying && isSharing),
    });

    // Holds the ffmpeg broadcast only while this device is really playing it.
    useVodRelayHeartbeat({
        videoEl,
        contentType: 'movie',
        streamId,
        active: isJoining || (isPlaying && isSharing),
        onEnded: () => {
            if (isJoining) router.back();
            else setIsSharing(false);
        },
    });

    // Calculate resumeTime synchronously based on progressLoaded
    const resumeTime = useMemo(() => {
        if (!progressLoaded) return 0;
        const progress = getProgress(streamId);
        if (progress && progress.progress > 10) {
            // Check if progress is near the end (more than 95%)
            if (progress.duration > 0) {
                const percentage = (progress.progress / progress.duration) * 100;
                if (percentage > 95) return 0;
            }
            return progress.progress;
        }
        return 0;
    }, [streamId, getProgress, progressLoaded]);

    useEffect(() => {
        if (!credentials || !streamId || isJoining) return;

        const loadMovieInfo = async () => {
            try {
                // Try cache first
                const cached = await getCachedDetail<MovieInfo>(streamId);
                if (cached && cached.info && cached.movie_data) {
                    setMovie(cached);
                    setLoading(false);
                    return;
                }

                const res = await fetch('/api/proxy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...credentials,
                        action: 'get_vod_info',
                        vod_id: streamId
                    })
                });

                const data = await res.json();
                if (data && data.info && data.movie_data) {
                    setMovie(data);
                    // Lazy cache the detail
                    await saveCachedDetail(streamId, data);
                } else {
                    setError("Detalhes do filme não encontrados.");
                }
            } catch (err) {
                console.error(err);
                setError("Falha ao carregar detalhes do filme.");
            } finally {
                setLoading(false);
            }
        };

        loadMovieInfo();
    }, [credentials, streamId, isJoining, getCachedDetail, saveCachedDetail]);

    // Resolve TMDB ID for better subtitle matching
    useEffect(() => {
        if (!movie || !tmdbConfigured || tmdbId) return;

        const resolveTmdbId = async () => {
            try {
                const result = await searchMovie(movie.info.name);
                if (result) {
                    setTmdbId(result.id);
                }
            } catch (err) {
                console.error('[WatchMoviePage] Failed to resolve TMDB ID:', err);
            }
        };

        resolveTmdbId();
    }, [movie, tmdbConfigured, tmdbId, searchMovie]);

    // Load saved subtitle on mount
    useEffect(() => {
        if (!streamId) return;

        const loadSavedSub = async () => {
            const saved = await getSavedSubtitle(streamId);
            if (saved && saved.vtt) {
                console.log('[WatchMoviePage] loading saved subtitle');
                const blob = new Blob([saved.vtt], { type: 'text/vtt' });
                setSubtitleUrl(URL.createObjectURL(blob));
            }
        };
        loadSavedSub();
    }, [streamId, getSavedSubtitle]);

    // Auto-play from continue watching
    useEffect(() => {
        if (searchParams.get('autoplay') === 'true' && movie && !isPlaying && progressLoaded) {
            setIsPlaying(true);
            // Clear autoplay search params immediately to prevent loop
            router.replace(`/dashboard/watch/movie/${streamId}`);
        }
    }, [searchParams, movie, progressLoaded, isPlaying, router, streamId]);

    const handlePlay = async () => {
        // Movie/series have no relay yet (VOD requires ffmpeg); when exhausted, we offer
        // joining a live broadcast instead of failing playback.
        if (await checkConnectionLimit()) {
            setShowLimitModal(true);
            return;
        }
        setIsPlaying(true);
    };

    const toggleFavorite = () => {
        if (!movie) return;
        const id = movie.movie_data.stream_id;
        if (isFavorite(id, 'movie')) {
            removeFavorite(id, 'movie');
        } else {
            addFavorite({
                id: id,
                type: 'movie',
                name: movie.info.name,
                image: movie.info.movie_image,
                rating: movie.info.rating
            });
        }
    };

    const handleProgress = (currentTime: number, duration: number) => {
        if (!movie) return;
        updateProgress({
            streamId: movie.movie_data.stream_id,
            type: 'movie',
            progress: currentTime,
            duration: duration,
            timestamp: Date.now(),
            name: movie.info.name,
            image: movie.info.movie_image
        });
    };

    const broadcastInfo = useMemo(
        () =>
            movie
                ? {
                      contentType: 'movie' as const,
                      streamId,
                      title: movie.info.name,
                      poster: movie.info.movie_image,
                      ext: movie.movie_data.container_extension,
                  }
                : null,
        [movie, streamId]
    );
    // Registers the broadcast when I share (not when just joining someone else's).
    useShareBroadcast(isSharing && !isJoining, broadcastInfo, () => setIsSharing(false));

    // Join another device broadcast (via VOD relay): does not depend on loading details.
    if (isJoining) {
        const src = relaySrc({ contentType: 'movie', streamId, ext: joinExt });
        return (
            <div className="fixed inset-0 bg-black z-50 flex flex-col">
                <div className="relative flex-1 flex items-center justify-center">
                    <VideoPlayer
                        src={src}
                        poster={joinPoster}
                        autoPlay={true}
                        onBack={() => router.back()}
                        enterFullscreen={true}
                        title={joinTitle}
                        onVideoElement={setVideoEl}
                        topRightSlot={
                            <div className="flex items-center space-x-2">
                                {canSync && <SyncButton role="viewer" onClick={sync} />}
                                <span className="px-3 py-2 rounded-full text-sm font-semibold bg-black/60 text-red-300 flex items-center space-x-2">
                                    <Radio size={18} className="animate-pulse" /> Modo TV
                                </span>
                            </div>
                        }
                    />
                </div>
            </div>
        );
    }

    if (loading || !progressLoaded || isDetailLoading) return <Loader />;

    if (error || !movie) {
        return (
            <div className="min-h-screen bg-[#141414] flex flex-col items-center justify-center text-white space-y-4">
                <p className="text-red-500 text-xl">{error || 'Filme não encontrado'}</p>
                <button onClick={() => router.back()} className="flex items-center space-x-2 px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20">
                    <ArrowLeft size={20} /> Voltar
                </button>
            </div>
        );
    }

    if (isPlaying) {
        const { hostUrl, username, password } = credentials!;
        const extension = movie.movie_data.container_extension;
        const directUrl = `${hostUrl}/movie/${username}/${password}/${streamId}.${extension}`;
        // Compartilhando → toca via relay (mesmo stream que outros aparelhos entram, estilo canal).
        const streamUrl = isSharing
            ? relaySrc({ contentType: 'movie', streamId, ext: extension })
            : directUrl;

        const shareToggle = (
            <button
                onClick={() => setIsSharing((v) => !v)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-full text-sm font-semibold transition-all shadow-xl focus:outline-none focus:ring-2 focus:ring-red-500 ${isSharing ? 'bg-red-600 text-white' : 'bg-black/60 text-gray-200 hover:bg-white/20'}`}
                title={isSharing ? 'Transmitindo para o Modo TV (sem avançar/pausar)' : 'Transmitir este filme no Modo TV'}
            >
                <Radio size={18} className={isSharing ? 'animate-pulse' : ''} />
                <span>{isSharing ? 'Transmitindo' : 'Transmitir'}</span>
            </button>
        );

        return (
            <div className="fixed inset-0 bg-black z-50 flex flex-col">
                <div className="relative flex-1 flex items-center justify-center">
                    <VideoPlayer
                        src={streamUrl}
                        poster={movie.info.movie_image}
                        autoPlay={true}
                        initialTime={isSharing ? 0 : resumeTime}
                        onProgress={isSharing ? undefined : handleProgress}
                        enterFullscreen={true}
                        onBack={() => setIsPlaying(false)}
                        subtitleUrl={subtitleUrl || undefined}
                        title={movie.info.name}
                        onVideoElement={setVideoEl}
                        topRightSlot={
                            <div className="flex items-center space-x-2">
                                {isSharing && canSync && <SyncButton role="broadcaster" onClick={sync} />}
                                {shareToggle}
                            </div>
                        }
                    />
                </div>
            </div>
        );
    }

    // Details View
    return (
        <div className="min-h-screen bg-[#141414] text-white ">
            {/* Background Backdrop (using poster logic if backdrop not available, blurred) */}
            <div className="absolute inset-0 overflow-hidden">
                <div
                    className="absolute inset-0 bg-cover bg-center blur-3xl opacity-30 scale-110"
                    style={{ backgroundImage: `url(${movie.info.movie_image})` }}
                ></div>
                <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/80 to-transparent"></div>
            </div>

            <div className="relative z-10 container mx-auto p-4 md:p-6 lg:p-10">
                <button
                    onClick={() => router.back()}
                    data-focusable="true"
                    tabIndex={0}
                    className="mb-8 flex items-center space-x-2 text-gray-300 hover:text-white transition-colors focus:outline-none focus:text-red-500 focus:scale-110 origin-left"
                >
                    <ArrowLeft size={24} /> Voltar
                </button>

                <div className="flex flex-col lg:flex-row space-y-10 lg:space-y-0 lg:space-x-16 items-start">
                    {/* Poster */}
                    <div className="w-full max-w-[300px] lg:max-w-[400px] flex-shrink-0 rounded-xl overflow-hidden shadow-2xl shadow-black/50 mx-auto lg:mx-0">
                        <img
                            src={movie.info.movie_image}
                            alt={movie.info.name}
                            className="w-full h-auto"
                            onError={(e) => e.currentTarget.src = 'https://via.placeholder.com/300x450?text=Sem+Poster'}
                        />
                    </div>

                    {/* Metadata */}
                    <div className="flex-1 space-y-6">
                        <h1 className="text-3xl lg:text-5xl font-bold leading-tight">{movie.info.name}</h1>

                        <div className="flex flex-wrap items-center space-x-4 text-sm lg:text-base text-gray-300">
                            {movie.info.releasedate && (
                                <span className="flex items-center space-x-1 bg-white/10 px-3 py-1 rounded-full">
                                    <Calendar size={16} /> {movie.info.releasedate}
                                </span>
                            )}
                            {movie.info.rating && (
                                <span className="flex items-center space-x-1 bg-yellow-500/20 text-yellow-500 px-3 py-1 rounded-full border border-yellow-500/30">
                                    <Star size={16} fill="currentColor" /> {movie.info.rating}
                                </span>
                            )}
                            {movie.info.duration && (
                                <span className="flex items-center space-x-1 bg-white/10 px-3 py-1 rounded-full">
                                    <Clock size={16} /> {movie.info.duration}
                                </span>
                            )}
                        </div>

                        <p className="text-lg text-gray-300 leading-relaxed max-w-3xl">
                            {movie.info.plot || "Nenhuma descrição disponível."}
                        </p>

                        <div className="space-y-2 text-gray-400">
                            <p><strong className="text-white">Gênero:</strong> {movie.info.genre}</p>
                            <p><strong className="text-white">Diretor:</strong> {movie.info.director}</p>
                        </div>
                        <div className='flex items-center space-x-4'>
                            <button
                                onClick={handlePlay}
                                data-focusable="true"
                                tabIndex={0}
                                className="bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-10 rounded-full flex items-center space-x-3 transition-all transform hover:scale-105 shadow-lg shadow-red-900/40 focus:outline-none focus:ring-4 focus:ring-white focus:scale-110"
                            >
                                <Play size={28} fill="currentColor" />
                                <span>Reproduzir Filme</span>
                            </button>
                            <button
                                onClick={() => setShowSubtitlePanel(true)}
                                data-focusable="true"
                                tabIndex={0}
                                className={`font-bold py-4 px-8 rounded-full flex items-center space-x-3 transition-all transform hover:scale-105 shadow-lg focus:outline-none focus:ring-4 focus:ring-white focus:scale-110 ${subtitleUrl
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-900/40'
                                    : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
                                    }`}
                            >
                                <Subtitles size={24} />
                                <span>{subtitleUrl ? 'Legendas ✓' : 'Legendas'}</span>
                            </button>
                            <button
                                onClick={toggleFavorite}
                                data-focusable="true"
                                tabIndex={0}
                                className={`p-4 rounded-full border transition-all focus:outline-none focus:ring-4 focus:ring-white ${movie && isFavorite(movie.movie_data.stream_id, 'movie')
                                    ? 'bg-white text-red-600 border-white'
                                    : 'bg-transparent text-white border-white/30 hover:bg-white/10'
                                    }`}
                            >
                                <Bookmark size={28} fill={movie && isFavorite(movie.movie_data.stream_id, 'movie') ? "currentColor" : "none"} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {showSubtitlePanel && (
                <SubtitleSearchPanel
                    title={movie.info.name}
                    year={movie.info.releasedate}
                    tmdbId={tmdbId}
                    streamId={streamId}
                    onSubtitleSelected={(url) => setSubtitleUrl(url)}
                    onClose={() => setShowSubtitlePanel(false)}
                />
            )}

            <LimitReachedModal open={showLimitModal} onClose={() => setShowLimitModal(false)} />
        </div>
    );
}
