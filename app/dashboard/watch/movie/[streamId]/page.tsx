'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/app/context/AuthContext';
import { useFavorites } from '@/app/context/FavoritesContext';
import { useWatchProgress } from '@/app/context/WatchProgressContext';
import VideoPlayer from '@/components/VideoPlayer';
import { ArrowLeft, Play, Calendar, Star, Clock, Heart } from 'lucide-react';
import Loader from '@/components/Loader';

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

export default function WatchMoviePage() {
    const { credentials } = useAuth();
    const { isFavorite, addFavorite, removeFavorite } = useFavorites();
    const { updateProgress, getProgress } = useWatchProgress();
    const { getCachedDetail, saveCachedDetail } = useData();
    const params = useParams();
    const router = useRouter();
    const streamId = params.streamId as string;

    const [movie, setMovie] = useState<MovieInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resumeTime, setResumeTime] = useState(0);

    useEffect(() => {
        if (!credentials || !streamId) return;

        const loadMovieInfo = async () => {
            try {
                // Check progress
                const progress = getProgress(streamId);
                if (progress && progress.progress > 10) { // Only resume if more than 10s
                    setResumeTime(progress.progress);
                }

                // Try cache first
                const cached = await getCachedDetail(streamId);
                if (cached) {
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
                if (data && data.info) {
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
    }, [credentials, streamId, getCachedDetail, saveCachedDetail, getProgress]);

    // Auto-play from continue watching
    const searchParams = useSearchParams();
    useEffect(() => {
        if (searchParams.get('autoplay') === 'true' && movie && !isPlaying) {
            setIsPlaying(true);
        }
    }, [searchParams, movie]);

    const handlePlay = () => {
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
        // Save progress every 10 seconds or when significantly changed
        // To keep it simple, the Context handles debounce.
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

    if (loading) return <Loader />;

    if (error || !movie) {
        return (
            <div className="min-h-screen bg-[#141414] flex flex-col items-center justify-center text-white space-y-4">
                <p className="text-red-500 text-xl">{error || 'Filme não encontrado'}</p>
                <button onClick={() => router.back()} className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20">
                    <ArrowLeft size={20} /> Voltar
                </button>
            </div>
        );
    }

    if (isPlaying) {
        const { hostUrl, username, password } = credentials!;
        const extension = movie.movie_data.container_extension;
        const streamUrl = `${hostUrl}/movie/${username}/${password}/${streamId}.${extension}`;

        return (
            <div className="fixed inset-0 bg-black z-50 flex flex-col">
                <div className="relative flex-1 flex items-center justify-center">
                    <VideoPlayer
                        src={streamUrl}
                        poster={movie.info.movie_image}
                        autoPlay={true}
                        initialTime={resumeTime}
                        onProgress={handleProgress}
                        enterFullscreen={true}
                        onBack={() => setIsPlaying(false)}
                    />
                </div>
            </div>
        );
    }

    // Details View
    return (
        <div className="min-h-screen bg-[#141414] text-white">
            {/* Background Backdrop (using poster logic if backdrop not available, blurred) */}
            <div className="absolute inset-0 overflow-hidden">
                <div
                    className="absolute inset-0 bg-cover bg-center blur-3xl opacity-30 scale-110"
                    style={{ backgroundImage: `url(${movie.info.movie_image})` }}
                ></div>
                <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/80 to-transparent"></div>
            </div>

            <div className="relative z-10 container mx-auto px-6 py-12 lg:py-20">
                <button
                    onClick={() => router.back()}
                    data-focusable="true"
                    tabIndex={0}
                    className="mb-8 flex items-center gap-2 text-gray-300 hover:text-white transition-colors focus:outline-none focus:text-red-500 focus:scale-110 origin-left"
                >
                    <ArrowLeft size={24} /> Voltar
                </button>

                <div className="flex flex-col lg:flex-row gap-10 lg:gap-16 items-start">
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
                        <h1 className="text-4xl lg:text-6xl font-bold leading-tight">{movie.info.name}</h1>

                        <div className="flex flex-wrap items-center gap-4 text-sm lg:text-base text-gray-300">
                            {movie.info.releasedate && (
                                <span className="flex items-center gap-1 bg-white/10 px-3 py-1 rounded-full">
                                    <Calendar size={16} /> {movie.info.releasedate}
                                </span>
                            )}
                            {movie.info.rating && (
                                <span className="flex items-center gap-1 bg-yellow-500/20 text-yellow-500 px-3 py-1 rounded-full border border-yellow-500/30">
                                    <Star size={16} fill="currentColor" /> {movie.info.rating}
                                </span>
                            )}
                            {movie.info.duration && (
                                <span className="flex items-center gap-1 bg-white/10 px-3 py-1 rounded-full">
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

                        <button
                            onClick={handlePlay}
                            data-focusable="true"
                            tabIndex={0}
                            className="mt-8 bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-10 rounded-full flex items-center gap-3 transition-all transform hover:scale-105 shadow-lg shadow-red-900/40 focus:outline-none focus:ring-4 focus:ring-white focus:scale-110"
                        >
                            <Play size={28} fill="currentColor" />
                            <span>Reproduzir Filme</span>
                        </button>

                        <button
                            onClick={toggleFavorite}
                            data-focusable="true"
                            tabIndex={0}
                            className={`mt-4 ml-4 p-4 rounded-full border transition-all focus:outline-none focus:ring-4 focus:ring-white ${movie && isFavorite(movie.movie_data.stream_id, 'movie')
                                ? 'bg-white text-red-600 border-white'
                                : 'bg-transparent text-white border-white/30 hover:bg-white/10'
                                }`}
                        >
                            <Heart size={28} fill={movie && isFavorite(movie.movie_data.stream_id, 'movie') ? "currentColor" : "none"} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
