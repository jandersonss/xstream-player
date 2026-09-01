'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/app/context/AuthContext';
import { useFavorites } from '@/app/context/FavoritesContext';
import VideoPlayer from '@/components/VideoPlayer';
import type Hls from 'hls.js';
import { useWatchProgress } from '@/app/context/WatchProgressContext';
import { ArrowLeft, Play, Calendar, Star, Clock, List, Bookmark, Subtitles, Radio, Download, Loader2, X, Search, Check } from 'lucide-react';
import Loader from '@/components/Loader';
import SubtitleSearchPanel from '@/components/SubtitleSearchPanel';
import SyncButton from '@/components/SyncButton';
import { apiFetch } from '@/app/lib/apiClient';
import BroadcastStartModal from '@/components/BroadcastStartModal';
import { useShareBroadcast, useSyncPlayback, syncKey, relaySrc } from '@/app/hooks/useLiveShare';
import { useVodRelayHeartbeat } from '@/app/hooks/useVodRelayHeartbeat';
import { getAutoBroadcast } from '@/app/lib/device';

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
import { useTMDb } from '@/app/context/TMDbContext';
import { useProfile } from '@/app/context/ProfileContext';
import { useSubtitle, EpisodeSubtitleStatus } from '@/app/context/SubtitleContext';

const BATCH_LANGUAGES = [
    { code: 'pt-BR', label: 'Português BR' },
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Español' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
    { code: 'it', label: 'Italiano' },
];

export default function WatchSeriesPage() {
    const { credentials } = useAuth();
    const { isFavorite, addFavorite, removeFavorite } = useFavorites();
    const { updateProgress, getProgress, loadDetail, isLoaded: progressLoaded, loadingDetails } = useWatchProgress();
    const { getCachedDetail, saveCachedDetail } = useData();
    const { searchTV, isConfigured: tmdbConfigured } = useTMDb();
    const { getSavedSubtitle, searchSeriesSubtitles, downloadSeriesSubtitles, autoDownloadEpisodeSubtitle, remainingDownloads } = useSubtitle();
    const { activeProfile } = useProfile();
    const params = useParams();
    const router = useRouter();
    const seriesId = params.seriesId as string;
    const isDetailLoading = loadingDetails[`series-${seriesId}`];

    const [series, setSeries] = useState<SeriesInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [activeSeason, setActiveSeason] = useState<string>("1");
    const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);
    const [showSubtitlePanel, setShowSubtitlePanel] = useState(false);
    const [parentTmdbId, setParentTmdbId] = useState<number | undefined>(undefined);
    // Searches/downloads subtitles for all episodes in batch.
    const [batchLanguage, setBatchLanguage] = useState(
        () => activeProfile?.prefs.subtitleLanguage ?? 'pt-BR'
    );
    // Subtitle status per episode (key = episode.id).
    const [availability, setAvailability] = useState<Record<string, EpisodeSubtitleStatus>>({});
    const [batch, setBatch] = useState<{
        phase: 'searching' | 'searched' | 'downloading' | 'done';
        done: number;
        total: number;
        downloadedNow: number;
        failed: number;
        quotaHit: boolean;
    } | null>(null);
    const batchCancelRef = useRef(false);
    // The series has at least one saved subtitle → enable on-demand download per ep.
    const [seriesHasSubs, setSeriesHasSubs] = useState(false);
    // Searching/downloading a subtitle automatically when opening an episode.
    const [autoSubLoading, setAutoSubLoading] = useState(false);
    const [isSharing, setIsSharing] = useState(() => getAutoBroadcast());
    const [showStartModal, setShowStartModal] = useState(false);
    // Where the broadcast should start, tied to the episode it was picked for — carrying it
    // to the next one would start that episode halfway through. `null` = not picked by hand
    // (auto-broadcast), which falls back to the saved progress.
    const [broadcastStart, setBroadcastStart] = useState<{ episodeId: string; start: number } | null>(null);
    // "Join" (Modo TV) params — via useSearchParams to work on the client.
    const searchParams = useSearchParams();
    const isJoining = searchParams.get('join') === '1';
    const joinExt = searchParams.get('ext') || undefined;
    const joinPoster = searchParams.get('poster') || undefined;
    const joinEpisode = searchParams.get('episode') || undefined;
    const joinTitle = searchParams.get('title') || undefined;

    // Time sync between players (broadcaster + viewers of the same episode).
    const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
    const [hlsInstance, setHlsInstance] = useState<Hls | null>(null);
    const { canSync, sync } = useSyncPlayback({
        videoEl,
        hls: hlsInstance,
        streamKey: syncKey('series', isJoining ? (joinEpisode || '') : (selectedEpisode?.id || '')),
        role: isJoining ? 'viewer' : 'broadcaster',
        active: isJoining || (!!selectedEpisode && isSharing),
    });

    // Holds the ffmpeg broadcast only while this device is really playing it.
    useVodRelayHeartbeat({
        videoEl,
        contentType: 'series',
        streamId: isJoining ? (joinEpisode || '') : (selectedEpisode?.id || ''),
        active: isJoining || (!!selectedEpisode && isSharing),
        onEnded: () => {
            if (isJoining) router.back();
            else setIsSharing(false);
        },
        // Viewer only: the broadcaster reloads itself through its own src change.
        onRestart: () => { if (isJoining) setReloadNonce((n) => n + 1); },
    });
    // Bumped when the broadcast is seeked, to force the joined player to reload.
    const [reloadNonce, setReloadNonce] = useState(0);

    // Calculate resumeTime synchronously based on selected episode
    const resumeTime = useMemo(() => {
        if (selectedEpisode) {
            const progress = getProgress(selectedEpisode.id);
            if (progress && progress.progress > 10) {
                // Check if progress is near the end (more than 95%)
                const percentage = (progress.progress / progress.duration) * 100;
                if (percentage > 95) {
                    return 0;
                } else {
                    return progress.progress;
                }
            }
        }
        return 0;
    }, [selectedEpisode?.id, getProgress]);

    // The start point is baked into ffmpeg when the broadcast is created, so it is decided
    // once per episode. Leaving it derived from the saved progress would move it while
    // broadcasting (the progress now keeps being written), rewriting the stream URL
    // mid-playback and reloading the player over and over.
    useEffect(() => {
        const episodeId = selectedEpisode?.id;
        if (!isSharing || !episodeId) return;
        setBroadcastStart(prev => (prev?.episodeId === episodeId ? prev : { episodeId, start: resumeTime }));
    }, [isSharing, selectedEpisode?.id, resumeTime]);

    useEffect(() => {
        if (!credentials || !seriesId || isJoining) return;

        const loadSeriesInfo = async () => {
            try {
                // Try cache first
                const cached = await getCachedDetail<SeriesInfo>('series', seriesId);
                if (cached && cached.info && cached.episodes) {
                    setSeries(cached);
                    // Set initial season if available
                    const seasons = Object.keys(cached.episodes || {});
                    if (seasons.length > 0) {
                        setActiveSeason(seasons[0]);
                    }
                    setLoading(false);
                    return;
                }

                const res = await apiFetch('/api/proxy', {
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
                    await saveCachedDetail('series', seriesId, data);

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
    }, [credentials, seriesId, isJoining, getCachedDetail, saveCachedDetail]);

    // Resolve TMDB ID for better subtitle matching
    useEffect(() => {
        if (!series || !tmdbConfigured || parentTmdbId) return;

        const resolveTmdbId = async () => {
            try {
                const result = await searchTV(series.info.name);
                if (result) {
                    setParentTmdbId(result.id);
                }
            } catch (err) {
                console.error('[WatchSeriesPage] Failed to resolve TMDB ID:', err);
            }
        };

        resolveTmdbId();
    }, [series, tmdbConfigured, parentTmdbId, searchTV]);

    // Marks in one pass the episodes that already have a saved subtitle on the server.
    useEffect(() => {
        if (!series) return;

        const markDownloaded = async () => {
            try {
                const res = await apiFetch(
                    `/api/subtitles/user/list?language=${encodeURIComponent(batchLanguage)}`
                );
                if (!res.ok) return;
                const { streamIds } = await res.json();
                const saved = new Set<string>(streamIds || []);

                const map: Record<string, EpisodeSubtitleStatus> = {};
                Object.values(series.episodes).forEach(list => {
                    list.forEach(ep => {
                        if (saved.has(String(ep.id))) {
                            map[String(ep.id)] = { streamId: String(ep.id), status: 'downloaded' };
                        }
                    });
                });

                if (Object.keys(map).length > 0) {
                    setAvailability(prev => ({ ...map, ...prev }));
                    setSeriesHasSubs(true);
                }
            } catch (err) {
                console.warn('[WatchSeriesPage] Failed to list saved subtitles:', err);
            }
        };
        markDownloaded();
    }, [series, batchLanguage]);

    // On opening an episode: loads the saved subtitle or, if the series uses subtitles,
    // downloads the episode one on demand (transparent, respecting the daily quota).
    useEffect(() => {
        if (!selectedEpisode) return;
        const ep = selectedEpisode;
        let cancelled = false;

        const loadSub = async () => {
            const saved = await getSavedSubtitle(ep.id);
            if (cancelled) return;
            if (saved && saved.vtt) {
                const blob = new Blob([saved.vtt], { type: 'text/vtt' });
                setSubtitleUrl(URL.createObjectURL(blob));
                return;
            }

            // No saved subtitle: only auto-searches if the series already uses subtitles.
            if (!seriesHasSubs) return;

            const yearMatch = series?.info.releaseDate?.match(/\d{4}/);
            const searchParams: {
                languages: string;
                season_number: number;
                episode_number: number;
                parent_tmdb_id?: number;
                query?: string;
                year?: number;
            } = {
                languages: batchLanguage,
                season_number: Number(ep.season || activeSeason),
                episode_number: Number(ep.episode_num),
            };
            if (parentTmdbId) {
                searchParams.parent_tmdb_id = parentTmdbId;
            } else if (series) {
                searchParams.query = series.info.name;
                if (yearMatch) searchParams.year = parseInt(yearMatch[0]);
            }

            setAutoSubLoading(true);
            const result = await autoDownloadEpisodeSubtitle(ep.id, searchParams);
            if (cancelled) return;
            setAutoSubLoading(false);
            if (result.url) {
                setSubtitleUrl(result.url);
                setAvailability(prev => ({ ...prev, [ep.id]: { streamId: ep.id, status: 'downloaded' } }));
            }
        };

        loadSub();
        return () => { cancelled = true; };
    }, [selectedEpisode?.id, seriesHasSubs, parentTmdbId, batchLanguage, activeSeason, series, getSavedSubtitle, autoDownloadEpisodeSubtitle]);

    // Load detailed progress for this series
    useEffect(() => {
        if (seriesId) {
            loadDetail('series', seriesId);
        }
    }, [seriesId, loadDetail]);


    // Auto-play from continue watching
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
                    // Clear autoplay search params immediately to prevent loop
                    router.replace(`/dashboard/watch/series/${seriesId}`);
                } else {
                    console.warn('[Series Auto-play] Episode not found, using first episode of first season');
                    // Fallback: use first episode of first season
                    const firstSeason = Object.keys(series.episodes)[0];
                    if (firstSeason && series.episodes[firstSeason].length > 0) {
                        setActiveSeason(firstSeason);
                        setSelectedEpisode(series.episodes[firstSeason][0]);
                        router.replace(`/dashboard/watch/series/${seriesId}`);
                    }
                }
            } else {
                console.log('[Series Auto-play] No episode ID provided, using first episode');
                // No episode ID, use first episode of first season
                const firstSeason = Object.keys(series.episodes)[0];
                if (firstSeason && series.episodes[firstSeason].length > 0) {
                    setActiveSeason(firstSeason);
                    setSelectedEpisode(series.episodes[firstSeason][0]);
                    router.replace(`/dashboard/watch/series/${seriesId}`);
                }
            }
        }
    }, [searchParams, series, selectedEpisode, router, seriesId]);

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

    const isBatchBusy = batch?.phase === 'searching' || batch?.phase === 'downloading';

    // Flattens all episodes of all seasons, in order.
    const flattenEpisodes = () =>
        Object.keys(series?.episodes || {})
            .sort((a, b) => Number(a) - Number(b))
            .flatMap(season =>
                series!.episodes[season].map(ep => ({
                    streamId: String(ep.id),
                    seasonNumber: Number(ep.season || season),
                    episodeNumber: Number(ep.episode_num),
                }))
            );

    const handleBatchSearch = async () => {
        if (!series || isBatchBusy) return;

        const eps = flattenEpisodes();
        const yearMatch = series.info.releaseDate?.match(/\d{4}/);

        batchCancelRef.current = false;
        setAvailability({});
        setBatch({ phase: 'searching', done: 0, total: eps.length, downloadedNow: 0, failed: 0, quotaHit: false });

        const results = await searchSeriesSubtitles(
            eps,
            {
                languages: batchLanguage,
                parentTmdbId,
                query: series.info.name,
                year: yearMatch ? parseInt(yearMatch[0]) : undefined,
            },
            (done, _total, partial) => {
                const map: Record<string, EpisodeSubtitleStatus> = {};
                partial.forEach(s => { map[s.streamId] = s; });
                setAvailability(map);
                setBatch(prev => (prev ? { ...prev, done } : prev));
            },
            () => batchCancelRef.current,
        );

        const finalMap: Record<string, EpisodeSubtitleStatus> = {};
        results.forEach(s => { finalMap[s.streamId] = s; });
        setAvailability(finalMap);
        setBatch(prev => (prev ? { ...prev, phase: 'searched', done: results.length } : prev));
    };

    const handleBatchDownload = async () => {
        if (!series || isBatchBusy) return;

        const items = Object.values(availability)
            .filter(s => s.status === 'available' && s.fileId)
            .map(s => ({ streamId: s.streamId, fileId: s.fileId! }));
        if (items.length === 0) return;

        batchCancelRef.current = false;
        setBatch(prev => (prev ? { ...prev, phase: 'downloading', done: 0, total: items.length, downloadedNow: 0, failed: 0, quotaHit: false } : prev));

        const result = await downloadSeriesSubtitles(
            items,
            batchLanguage,
            (done, _total, last) => {
                if (last.ok) {
                    setAvailability(prev => ({ ...prev, [last.streamId]: { ...prev[last.streamId], status: 'downloaded' } }));
                }
                setBatch(prev => (prev ? { ...prev, done } : prev));
            },
            () => batchCancelRef.current,
        );

        if (result.downloaded > 0) setSeriesHasSubs(true);

        setBatch(prev => (prev ? {
            ...prev,
            phase: 'done',
            downloadedNow: result.downloaded,
            failed: result.failed,
            quotaHit: result.quotaHit,
            done: result.done,
            total: result.total,
        } : prev));
    };

    const broadcastInfo = useMemo(
        () =>
            series && selectedEpisode
                ? {
                      contentType: 'series' as const,
                      streamId: selectedEpisode.id,
                      title: `${series.info.name} - Ep ${selectedEpisode.episode_num}`,
                      poster: series.info.cover,
                      ext: selectedEpisode.container_extension,
                      seriesId,
                  }
                : null,
        [series, selectedEpisode, seriesId]
    );
    useShareBroadcast(isSharing && !isJoining, broadcastInfo, () => setIsSharing(false));

    // Join an episode broadcast from another device (via VOD relay).
    if (isJoining) {
        // The nonce changes on a broadcast seek, so the player reloads onto the new
        // timeline instead of stalling on a playlist that jumped backwards.
        const src = relaySrc({ contentType: 'series', streamId: joinEpisode || '', ext: joinExt })
            + (reloadNonce ? `&_r=${reloadNonce}` : '');
        return (
            <div className="fixed inset-0 bg-black z-50 flex flex-col">
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

    if (error || !series) {
        return (
            <div className="min-h-screen bg-[#141414] flex flex-col items-center justify-center text-white space-y-4">
                <p className="text-red-500 text-xl">{error || 'Série não encontrada'}</p>
                <button onClick={() => router.back()} className="flex items-center space-x-2 px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20">
                    <ArrowLeft size={20} /> Voltar
                </button>
            </div>
        );
    }

    if (selectedEpisode) {
        const { hostUrl, username, password } = credentials!;
        const extension = selectedEpisode.container_extension;
        const directUrl = `${hostUrl}/series/${username}/${password}/${selectedEpisode.id}.${extension}`;
        const startSeconds = broadcastStart?.episodeId === selectedEpisode.id
            ? broadcastStart.start
            : resumeTime;
        // Only the provider's own length is trustworthy here; the relay stream carries
        // just a sliding window, so without this the bar would measure the window.
        const rawDuration: unknown = selectedEpisode.info?.duration_secs;
        const titleDuration = typeof rawDuration === 'number' ? rawDuration : 0;

        // Seek outside the window: the upstream is re-read from the new point, which
        // moves every device watching this broadcast (one stream, like a channel).
        const handleBroadcastSeek = async (absolute: number) => {
            const start = Math.floor(absolute);
            try {
                const res = await apiFetch('/api/relay/vod', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'seek',
                        contentType: 'series',
                        streamId: selectedEpisode.id,
                        ext: extension,
                        start,
                    }),
                });
                if (!res.ok) return;
                // Reloads the player at the new offset (the src carries `start`).
                setBroadcastStart({ episodeId: selectedEpisode.id, start });
            } catch {
                /* seek is best-effort; the broadcast keeps running where it was */
            }
        };
        // While broadcasting the player's clock is the relay window, not the episode: the real
        // position is where ffmpeg started plus what has played since. Without this conversion
        // the progress would be unusable, which is why it used to be dropped altogether.
        const handleBroadcastProgress = (currentTime: number) => {
            handleProgress(startSeconds + currentTime, titleDuration);
        };
        // Sharing → plays the episode via relay (channel-style; others join at the same point).
        const streamUrl = isSharing
            ? relaySrc({ contentType: 'series', streamId: selectedEpisode.id, ext: extension, start: startSeconds })
            : directUrl;

        const shareToggle = (
            <button
                onClick={() => {
                    // Stopping is immediate; starting asks where to begin (the point is
                    // baked into ffmpeg and cannot change once it is running).
                    if (isSharing) {
                        setIsSharing(false);
                        setBroadcastStart(null);
                    } else {
                        setShowStartModal(true);
                    }
                }}
                className={`flex items-center space-x-2 px-3 py-2 rounded-full text-sm font-semibold transition-all shadow-xl focus:outline-none focus:ring-2 focus:ring-red-500 ${isSharing ? 'bg-red-600 text-white' : 'bg-black/60 text-gray-200 hover:bg-white/20'}`}
                title={isSharing ? 'Transmitindo para o Modo TV (sem avançar/pausar)' : 'Transmitir este episódio no Modo TV'}
            >
                <Radio size={18} className={isSharing ? 'animate-pulse' : ''} />
                <span>{isSharing ? 'Transmitindo' : 'Transmitir'}</span>
            </button>
        );

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
                setSubtitleUrl(null);
                setSelectedEpisode(allEpisodes[currentIndex + 1]);
            }
        };

        const playPrevious = () => {
            if (hasPrevious) {
                setSubtitleUrl(null);
                setSelectedEpisode(allEpisodes[currentIndex - 1]);
            }
        };

        const handleBackFromPlayer = () => {
            setSelectedEpisode(null);
        };

        return (
            <div className="fixed inset-0 bg-black z-50 flex flex-col">
                <div className="relative flex-1 flex items-center justify-center">
                    <VideoPlayer
                        src={streamUrl}
                        poster={series.info.cover}
                        autoPlay={true}
                        initialTime={isSharing ? 0 : resumeTime}
                        onProgress={isSharing ? handleBroadcastProgress : handleProgress}
                        timeOffset={isSharing ? startSeconds : 0}
                        totalDuration={isSharing ? titleDuration : 0}
                        onSeekBeyondWindow={isSharing ? handleBroadcastSeek : undefined}
                        onNext={hasNext ? playNext : undefined}
                        onPrevious={hasPrevious ? playPrevious : undefined}
                        hasNext={hasNext}
                        hasPrevious={hasPrevious}
                        onBack={handleBackFromPlayer}
                        subtitleUrl={subtitleUrl || undefined}
                        title={series.info.name}
                        subtitle={`T${selectedEpisode.season} · Ep ${selectedEpisode.episode_num}${selectedEpisode.title ? ` - ${selectedEpisode.title}` : ''}`}
                        onVideoElement={setVideoEl}
                        onHlsInstance={setHlsInstance}
                        topRightSlot={
                            <div className="flex items-center space-x-2">
                                {autoSubLoading && (
                                    <span className="px-3 py-2 rounded-full text-sm font-semibold bg-black/60 text-emerald-300 flex items-center space-x-2">
                                        <Loader2 size={16} className="animate-spin" /> Legenda…
                                    </span>
                                )}
                                {isSharing && canSync && <SyncButton role="broadcaster" onClick={sync} />}
                                {shareToggle}
                            </div>
                        }
                    />
                </div>
                {showStartModal && <BroadcastStartModal
                    resumeTime={resumeTime}
                    duration={getProgress(selectedEpisode.id)?.duration}
                    onCancel={() => setShowStartModal(false)}
                    onConfirm={(start) => {
                        setBroadcastStart({ episodeId: selectedEpisode.id, start });
                        setIsSharing(true);
                        setShowStartModal(false);
                    }}
                />}
            </div>
        );
    }

    const seasons = Object.keys(series.episodes || {}).sort((a, b) => Number(a) - Number(b));
    const currentEpisodes = series.episodes[activeSeason] || [];

    const availabilityList = Object.values(availability);
    const availableCount = availabilityList.filter(s => s.status === 'available').length;
    const downloadedCount = availabilityList.filter(s => s.status === 'downloaded').length;
    const unavailableCount = availabilityList.filter(s => s.status === 'unavailable').length;

    return (
        <div className="min-h-screen bg-[#141414] text-white">
            {/* Background Backdrop */}
            <div className="absolute inset-0 overflow-hidden h-[60vh]">
                <div
                    className="absolute inset-0 bg-cover bg-top  opacity-40 scale-105"
                    style={{ backgroundImage: `url(${series.info.cover})` }}
                ></div>
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#141414]/90 to-[#141414]"></div>
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

                <div className="flex flex-col lg:flex-row space-y-10 lg:space-y-0 lg:space-x-16 items-start mb-16">
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
                        <h1 className="text-3xl lg:text-5xl font-bold leading-tight">{series.info.name}</h1>

                        <div className="flex flex-wrap items-center space-x-4 text-sm lg:text-base text-gray-300">
                            {series.info.releaseDate && (
                                <span className="flex items-center space-x-1 bg-white/10 px-3 py-1 rounded-full">
                                    <Calendar size={16} /> {series.info.releaseDate}
                                </span>
                            )}
                            {series.info.rating && (
                                <span className="flex items-center space-x-1 bg-yellow-500/20 text-yellow-500 px-3 py-1 rounded-full border border-yellow-500/30">
                                    <Star size={16} fill="currentColor" /> {series.info.rating}
                                </span>
                            )}
                        </div>

                        <p className="text-lg text-gray-300 leading-relaxed max-w-3xl">
                            {series.info.plot || "Nenhuma sinopse disponível."}
                        </p>

                        <div className="flex space-x-4 mt-8">
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
                                className={`flex items-center space-x-2 px-6 py-3 rounded-full border transition-all focus:outline-none focus:ring-4 focus:ring-white ${isFavorite(seriesId, 'series')
                                    ? 'bg-white text-red-600 border-white font-bold'
                                    : 'bg-transparent text-white border-white/30 hover:bg-white/10'
                                    }`}
                            >
                                <Bookmark size={20} fill={isFavorite(seriesId, 'series') ? "currentColor" : "none"} />
                                {isFavorite(seriesId, 'series') ? 'Na Minha Lista' : 'Adicionar à Minha Lista'}
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
                    {/* Buscar / baixar legendas de todos os episódios */}
                    {/* flex gap needs Chrome 84+ (WebOS TVs lack it): child m-1.5 + p-2.5 emulate gap-3 + p-4 */}
                    <div className="flex flex-wrap items-center p-2.5 bg-[#1a1a1a] border border-[#333] rounded-xl">
                        <div className="m-1.5 flex items-center space-x-2 text-emerald-500">
                            <Subtitles size={20} />
                            <span className="text-sm font-semibold text-white">Legendas de toda a série</span>
                        </div>

                        {remainingDownloads !== null && (
                            <span className={`m-1.5 text-xs px-2 py-1 rounded ${remainingDownloads <= 0 ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                {remainingDownloads} download{remainingDownloads === 1 ? '' : 's'} restante{remainingDownloads === 1 ? '' : 's'} hoje
                            </span>
                        )}

                        <select
                            value={batchLanguage}
                            onChange={(e) => setBatchLanguage(e.target.value)}
                            disabled={isBatchBusy}
                            className="m-1.5 px-3 py-2 bg-[#0f0f0f] border border-[#333] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-50"
                        >
                            {BATCH_LANGUAGES.map(lang => (
                                <option key={lang.code} value={lang.code}>{lang.label}</option>
                            ))}
                        </select>

                        {isBatchBusy ? (
                            <button
                                onClick={() => { batchCancelRef.current = true; }}
                                className="m-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm font-medium flex items-center space-x-2 transition-colors"
                            >
                                <X size={16} /> Cancelar
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={handleBatchSearch}
                                    className="m-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-white text-sm font-medium flex items-center space-x-2 transition-colors"
                                >
                                    <Search size={16} /> Buscar legendas
                                </button>
                                {availableCount > 0 && (
                                    <button
                                        onClick={handleBatchDownload}
                                        className="m-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 border border-emerald-500/40 rounded-lg text-white text-sm font-medium flex items-center space-x-2 transition-colors"
                                    >
                                        <Download size={16} /> Baixar {availableCount} legenda{availableCount > 1 ? 's' : ''}
                                    </button>
                                )}
                            </>
                        )}

                        {batch && (
                            <div className="m-1.5 flex items-center space-x-2 text-xs text-gray-400 ml-auto">
                                {isBatchBusy && <Loader2 size={14} className="animate-spin text-emerald-500" />}
                                <span>
                                    {batch.phase === 'searching' && `Buscando ${batch.done}/${batch.total}…`}
                                    {batch.phase === 'downloading' && `Baixando ${batch.done}/${batch.total}…`}
                                    {batch.phase === 'searched' && (
                                        availableCount > 0
                                            ? `${availableCount} disponível(is) · ${downloadedCount} já baixada(s) · ${unavailableCount} sem legenda`
                                            : `Nenhuma legenda nova encontrada · ${downloadedCount} já baixada(s) · ${unavailableCount} sem legenda`
                                    )}
                                    {batch.phase === 'done' && (
                                        batch.quotaHit
                                            ? `Cota diária atingida. ${batch.downloadedNow} baixada(s) — o resto continua amanhã.`
                                            : `Concluído: ${batch.downloadedNow} baixada(s)${batch.failed > 0 ? ` · ${batch.failed} falharam` : ''}.`
                                    )}
                                </span>
                            </div>
                        )}

                        {seriesHasSubs && (
                            <p className="w-full text-xs text-gray-500">
                                Como a série já tem legendas, ao abrir um episódio sem legenda ela é baixada
                                automaticamente antes de reproduzir (consome 1 do limite diário de 5).
                            </p>
                        )}
                    </div>

                    <div className="flex items-center space-x-4 overflow-x-auto pb-4 scrollbar-hide border-b border-white/10">
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

                    {/* Single-column stack: CSS grid (Chrome 57+) and flex gap (84+) are
                        both missing on WebOS TVs, so a flex column with space-y does it */}
                    <div className="flex flex-col space-y-4">
                        {currentEpisodes.map((ep) => {
                            const progress = getProgress(ep.id);
                            const duration = progress?.duration || 0;
                            const currentTime = progress?.progress || 0;
                            const percent = duration > 0 ? (currentTime / duration) * 100 : 0;

                            return (
                                <button
                                    key={ep.id}
                                    type="button"
                                    onClick={() => setSelectedEpisode(ep)}
                                    data-focusable="true"
                                    tabIndex={0}
                                    className="relative flex items-center space-x-4 p-4 bg-[#1f1f1f] rounded-xl hover:bg-[#2a2a2a] transition-all cursor-pointer group border border-white/5 hover:border-red-500/30 focus:outline-none focus:ring-4 focus:ring-red-600 focus:scale-[1.02] z-10 w-full text-left overflow-hidden"
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
                                    {/* Status da legenda (após buscar em lote) */}
                                    {availability[ep.id]?.status === 'downloaded' && (
                                        <span className="text-xs px-2 py-1 rounded bg-emerald-600/20 text-emerald-400 flex items-center space-x-1 flex-shrink-0">
                                            <Check size={12} /> Legenda
                                        </span>
                                    )}
                                    {availability[ep.id]?.status === 'available' && (
                                        <span className="text-xs px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 flex-shrink-0">
                                            Disponível
                                        </span>
                                    )}
                                    {availability[ep.id]?.status === 'unavailable' && (
                                        <span className="text-xs px-2 py-1 rounded bg-white/5 text-gray-500 flex-shrink-0">
                                            Sem legenda
                                        </span>
                                    )}

                                    <div className="text-xs text-gray-500 bg-black/30 px-2 py-1 rounded">
                                        {ep.container_extension}
                                    </div>

                                    {/* Subtitle Button */}
                                    <div
                                        className="ml-2 flex-shrink-0"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedEpisode(null);
                                            setShowSubtitlePanel(true);
                                            // Store the episode info temporarily for the search
                                            (window as any).__subtitleEpisode = {
                                                seasonNumber: Number(ep.season || activeSeason),
                                                episodeNumber: Number(ep.episode_num),
                                                episodeRef: ep,
                                            };
                                        }}
                                    >
                                        <Subtitles
                                            size={18}
                                            className="text-gray-600 hover:text-emerald-400 transition-colors cursor-pointer"
                                        />
                                    </div>

                                    {/* Progress Bar */}
                                    {progress && duration > 0 && currentTime > 0 && (
                                        <div className="absolute bottom-0 left-0 w-full h-1.5 bg-gray-600/80">
                                            <div
                                                className="h-full bg-red-600 transition-all duration-500"
                                                style={{ width: `${Math.min(percent, 100)}%` }}
                                            />
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                        {currentEpisodes.length === 0 && (
                            <p className="text-gray-500">Nenhum episódio encontrado para esta temporada.</p>
                        )}
                    </div>
                </div>
            </div>

            {showSubtitlePanel && (
                <SubtitleSearchPanel
                    title={series.info.name}
                    year={series.info.releaseDate}
                    seasonNumber={(window as any).__subtitleEpisode?.seasonNumber || Number(activeSeason)}
                    episodeNumber={(window as any).__subtitleEpisode?.episodeNumber || 1}
                    parentTmdbId={parentTmdbId}
                    streamId={(window as any).__subtitleEpisode?.episodeRef?.id || String(seriesId)}
                    onSubtitleSelected={(url) => {
                        setSubtitleUrl(url);
                        // Auto-select the episode that was clicked for subtitle search
                        const epRef = (window as any).__subtitleEpisode?.episodeRef;
                        if (epRef) {
                            setSelectedEpisode(epRef);
                        }
                    }}
                    onClose={() => {
                        setShowSubtitlePanel(false);
                        (window as any).__subtitleEpisode = null;
                    }}
                />
            )}
        </div>
    );
}
