'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/app/context/AuthContext';
import { useFavorites } from '@/app/context/FavoritesContext';
import { useWatchProgress } from '@/app/context/WatchProgressContext';
import VideoPlayer from '@/components/VideoPlayer';
import type Hls from 'hls.js';
import { ArrowLeft, Play, Calendar, Star, Clock, Bookmark, Subtitles } from 'lucide-react';
import Loader from '@/components/Loader';
import SubtitleSearchPanel from '@/components/SubtitleSearchPanel';
import LimitReachedModal from '@/components/LimitReachedModal';
import { apiFetch } from '@/app/lib/apiClient';
import BroadcastStartModal from '@/components/BroadcastStartModal';
import BroadcastToggle from '@/components/BroadcastToggle';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import EmptyState from '@/components/ui/EmptyState';
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
        /** Real length in seconds, from the provider — the broadcast timeline needs it. */
        duration_secs?: number;
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
    const [showStartModal, setShowStartModal] = useState(false);
    // Where the broadcast should start. `null` = not picked by hand (auto-broadcast),
    // which falls back to the saved progress.
    const [broadcastStart, setBroadcastStart] = useState<number | null>(null);
    // "Join" (Modo TV) params — via useSearchParams to work on the client.
    const searchParams = useSearchParams();
    const isJoining = searchParams.get('join') === '1';
    const joinExt = searchParams.get('ext') || undefined;
    const joinPoster = searchParams.get('poster') || undefined;
    const joinTitle = searchParams.get('title') || undefined;

    // Time sync between players (broadcaster + viewers of the same movie).
    const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
    const [hlsInstance, setHlsInstance] = useState<Hls | null>(null);
    const { canSync, sync } = useSyncPlayback({
        videoEl,
        hls: hlsInstance,
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
        // Viewer only: the broadcaster reloads itself through its own src change.
        onRestart: () => { if (isJoining) setReloadNonce((n) => n + 1); },
    });
    // Bumped when the broadcast is seeked, to force the joined player to reload.
    const [reloadNonce, setReloadNonce] = useState(0);

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

    // The start point is baked into ffmpeg when the broadcast is created, so it is decided
    // once. Leaving it derived from the saved progress would move it while broadcasting
    // (the progress now keeps being written), rewriting the stream URL mid-playback and
    // reloading the player over and over.
    useEffect(() => {
        if (!isSharing || !isPlaying) return;
        setBroadcastStart(prev => prev ?? resumeTime);
    }, [isSharing, isPlaying, resumeTime]);

    useEffect(() => {
        if (!credentials || !streamId || isJoining) return;

        const loadMovieInfo = async () => {
            try {
                // Try cache first
                const cached = await getCachedDetail<MovieInfo>('movie', streamId);
                if (cached && cached.info && cached.movie_data) {
                    setMovie(cached);
                    setLoading(false);
                    return;
                }

                const res = await apiFetch('/api/proxy', {
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
                    await saveCachedDetail('movie', streamId, data);
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
        // The nonce changes on a broadcast seek, so the player reloads onto the new
        // timeline instead of stalling on a playlist that jumped backwards.
        const src = relaySrc({ contentType: 'movie', streamId, ext: joinExt })
            + (reloadNonce ? `&_r=${reloadNonce}` : '');
        return (
            <div className="fixed inset-0 bg-bg z-50 flex flex-col">
                <div className="relative flex-1 flex items-center justify-center">
                    <VideoPlayer
                        src={src}
                        poster={joinPoster}
                        autoPlay={true}
                        onBack={() => router.back()}
                        title={joinTitle}
                        onVideoElement={setVideoEl}
                        onHlsInstance={setHlsInstance}
                        topRightSlot={
                            <div className="flex items-center space-x-2">
                                {canSync && <SyncButton role="viewer" onClick={sync} />}
                                <Badge tone="live" dot>Modo TV</Badge>
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
            <div className="min-h-screen bg-bg flex flex-col items-center justify-center">
                <EmptyState
                    title={error || 'Filme não encontrado'}
                    action={
                        <Button variant="secondary" icon={ArrowLeft} onClick={() => router.back()}>
                            Voltar
                        </Button>
                    }
                />
            </div>
        );
    }

    if (isPlaying) {
        const { hostUrl, username, password } = credentials!;
        const extension = movie.movie_data.container_extension;
        const directUrl = `${hostUrl}/movie/${username}/${password}/${streamId}.${extension}`;
        const startSeconds = broadcastStart ?? resumeTime;
        // Only the provider's own length is trustworthy here; the relay stream carries
        // just a sliding window, so without this the bar would measure the window.
        const titleDuration = movie.info.duration_secs ?? 0;

        // Seek outside the window: the upstream is re-read from the new point, which
        // moves every device watching this broadcast (one stream, like a channel).
        const handleBroadcastSeek = async (absolute: number) => {
            const start = Math.floor(absolute);
            try {
                const res = await apiFetch('/api/relay/vod', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'seek', contentType: 'movie', streamId, ext: extension, start }),
                });
                if (!res.ok) return;
                // Reloads the player at the new offset (the src carries `start`).
                setBroadcastStart(start);
            } catch {
                /* seek is best-effort; the broadcast keeps running where it was */
            }
        };
        // While broadcasting the player's clock is the relay window, not the title: the real
        // position is where ffmpeg started plus what has played since. Without this conversion
        // the progress would be unusable, which is why it used to be dropped altogether.
        const handleBroadcastProgress = (currentTime: number) => {
            handleProgress(startSeconds + currentTime, titleDuration);
        };
        // Compartilhando → toca via relay (mesmo stream que outros aparelhos entram, estilo canal).
        const streamUrl = isSharing
            ? relaySrc({ contentType: 'movie', streamId, ext: extension, start: startSeconds })
            : directUrl;

        return (
            <div className="fixed inset-0 bg-bg z-50 flex flex-col">
                <div className="relative flex-1 flex items-center justify-center">
                    <VideoPlayer
                        src={streamUrl}
                        poster={movie.info.movie_image}
                        autoPlay={true}
                        initialTime={isSharing ? 0 : resumeTime}
                        onProgress={isSharing ? handleBroadcastProgress : handleProgress}
                        timeOffset={isSharing ? startSeconds : 0}
                        totalDuration={isSharing ? titleDuration : 0}
                        onSeekBeyondWindow={isSharing ? handleBroadcastSeek : undefined}
                        onBack={() => setIsPlaying(false)}
                        subtitleUrl={subtitleUrl || undefined}
                        title={movie.info.name}
                        onVideoElement={setVideoEl}
                        onHlsInstance={setHlsInstance}
                        topRightSlot={
                            <div className="flex items-center space-x-2">
                                {isSharing && canSync && <SyncButton role="broadcaster" onClick={sync} />}
                                <BroadcastToggle
                                    active={isSharing}
                                    onToggle={() => {
                                        // Stopping is immediate; starting asks where to begin (the point is
                                        // baked into ffmpeg and cannot change once it is running).
                                        if (isSharing) {
                                            setIsSharing(false);
                                            setBroadcastStart(null);
                                        } else {
                                            setShowStartModal(true);
                                        }
                                    }}
                                />
                            </div>
                        }
                    />
                </div>
                {showStartModal && <BroadcastStartModal
                    resumeTime={resumeTime}
                    duration={getProgress(streamId)?.duration}
                    onCancel={() => setShowStartModal(false)}
                    onConfirm={(start) => {
                        setBroadcastStart(start);
                        setIsSharing(true);
                        setShowStartModal(false);
                    }}
                />}
            </div>
        );
    }

    // Details View
    const favorited = isFavorite(movie.movie_data.stream_id, 'movie');
    const hasProgress = resumeTime > 0;

    return (
        <div className="min-h-screen bg-bg text-ink">
            {/* Background Backdrop (using poster logic if backdrop not available, blurred) */}
            <div className="absolute inset-0 overflow-hidden">
                <div
                    className="absolute inset-0 bg-cover bg-center blur-3xl opacity-30 scale-110"
                    style={{ backgroundImage: `url(${movie.info.movie_image})` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/80 to-transparent" />
                <div className="absolute inset-0 w-1/2 bg-gradient-to-r from-bg/80 to-transparent" />
            </div>

            <div className="relative z-10 px-6 md:px-10 lg:px-14 py-8">
                <Button variant="ghost" icon={ArrowLeft} onClick={() => router.back()} className="mb-8">
                    Voltar
                </Button>

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
                        <h1 className="text-3xl md:text-5xl font-semibold tracking-tight leading-tight">{movie.info.name}</h1>

                        <div className="flex flex-wrap items-center">
                            {movie.info.releasedate && (
                                <span className="mr-2 mb-2">
                                    <Badge>
                                        <Calendar size={14} className="mr-1.5" /> {movie.info.releasedate}
                                    </Badge>
                                </span>
                            )}
                            {movie.info.rating && (
                                <span className="mr-2 mb-2 flex items-center text-sm text-ink-2 tnum">
                                    <Star size={16} className="mr-1 text-ink-2" fill="currentColor" /> {movie.info.rating}
                                </span>
                            )}
                            {movie.info.duration && (
                                <span className="mr-2 mb-2">
                                    <Badge>
                                        <Clock size={14} className="mr-1.5" /> {movie.info.duration}
                                    </Badge>
                                </span>
                            )}
                        </div>

                        <p className="text-sm md:text-base text-ink-2 leading-relaxed max-w-3xl">
                            {movie.info.plot || "Nenhuma descrição disponível."}
                        </p>

                        <div className="space-y-1 text-sm text-ink-2">
                            {movie.info.genre && <p><span className="text-ink font-medium">Gênero:</span> {movie.info.genre}</p>}
                            {movie.info.director && <p><span className="text-ink font-medium">Diretor:</span> {movie.info.director}</p>}
                        </div>

                        <div className="flex items-center space-x-3">
                            <Button variant="primary" size="lg" icon={Play} onClick={handlePlay}>
                                {hasProgress ? <>Retomar · <span className="tnum ml-1">{formatDuration(resumeTime)}</span></> : 'Assistir'}
                            </Button>
                            <Button variant="secondary" size="lg" icon={Subtitles} onClick={() => setShowSubtitlePanel(true)}>
                                {subtitleUrl ? 'Legendas ✓' : 'Legendas'}
                            </Button>
                            <IconButton
                                icon={Bookmark}
                                label={favorited ? 'Remover da minha lista' : 'Adicionar à minha lista'}
                                variant="secondary"
                                active={favorited}
                                onClick={toggleFavorite}
                            />
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

/** Formats seconds as "H:MM:SS" or "M:SS" for the "Retomar" label. */
function formatDuration(totalSeconds: number): string {
    const s = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
