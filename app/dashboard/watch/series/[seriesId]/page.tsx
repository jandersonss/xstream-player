'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/app/context/AuthContext';
import { useFavorites } from '@/app/context/FavoritesContext';
import VideoPlayer from '@/components/VideoPlayer';
import type Hls from 'hls.js';
import { useWatchProgress } from '@/app/context/WatchProgressContext';
import { ArrowLeft, Play, Calendar, Star, Clock, Bookmark, Subtitles, Download, Loader2, X, Search, Check } from 'lucide-react';
import Loader from '@/components/Loader';
import SubtitleSearchPanel from '@/components/SubtitleSearchPanel';
import SyncButton from '@/components/SyncButton';
import { apiFetch } from '@/app/lib/apiClient';
import BroadcastStartModal from '@/components/BroadcastStartModal';
import BroadcastToggle from '@/components/BroadcastToggle';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import EmptyState from '@/components/ui/EmptyState';
import Field, { inputClassName } from '@/components/ui/Field';
import { useShareBroadcast, useSyncPlayback, syncKey, relaySrc } from '@/app/hooks/useLiveShare';
import { useVodRelayHeartbeat } from '@/app/hooks/useVodRelayHeartbeat';
import { getAutoBroadcast } from '@/app/lib/device';

// Types
interface EpisodeInfo {
    movie_image?: string;
    plot?: string;
    duration?: string;
    duration_secs?: number;
    releasedate?: string;
}

interface Episode {
    id: string;
    episode_num: string | number;
    title: string;
    container_extension: string;
    info: EpisodeInfo;
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

/** Context passed to `SubtitleSearchPanel` when it is opened from an episode row. */
interface SubtitleEpisodeContext {
    seasonNumber: number;
    episodeNumber: number;
    episodeRef: Episode;
}

// The subtitle panel is a shared component that does not know about episodes; this global
// carries which episode triggered it. Not refactored per spec 07 — only typed safely here
// instead of the original `window as any`.
function getSubtitleEpisodeContext(): SubtitleEpisodeContext | null {
    return (window as unknown as { __subtitleEpisode?: SubtitleEpisodeContext | null }).__subtitleEpisode ?? null;
}

function setSubtitleEpisodeContext(ctx: SubtitleEpisodeContext | null) {
    (window as unknown as { __subtitleEpisode?: SubtitleEpisodeContext | null }).__subtitleEpisode = ctx;
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
    const {
        getSavedSubtitle, searchSeriesSubtitles, downloadSeriesSubtitles, autoDownloadEpisodeSubtitle,
        remainingDownloads, isConfigured: subtitlesConfigured, isConfigResolved: subtitlesConfigResolved,
        ensureConfigLoaded: ensureSubtitleConfigLoaded,
    } = useSubtitle();
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

    // Resolved eagerly, not lazily on panel open — the batch subtitle section
    // needs to know right away whether to show its CTA or its controls.
    useEffect(() => {
        ensureSubtitleConfigLoaded();
    }, [ensureSubtitleConfigLoaded]);

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

    if (error || !series) {
        return (
            <div className="min-h-screen bg-bg flex flex-col items-center justify-center">
                <EmptyState
                    title={error || 'Série não encontrada'}
                    action={
                        <Button variant="secondary" icon={ArrowLeft} onClick={() => router.back()}>
                            Voltar
                        </Button>
                    }
                />
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
        const titleDuration = selectedEpisode.info?.duration_secs ?? 0;

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
            <div className="fixed inset-0 bg-bg z-50 flex flex-col">
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
                                    <span className="flex items-center space-x-2 h-10 px-3 rounded-full bg-surface-2 text-ok text-sm">
                                        <Loader2 size={16} className="animate-spin" />
                                        <span>Legenda…</span>
                                    </span>
                                )}
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

    const favorited = isFavorite(seriesId, 'series');

    return (
        <div className="min-h-screen bg-bg text-ink">
            {/* Background Backdrop — same treatment as the movie detail screen (spec 07 §6) */}
            <div className="absolute inset-0 overflow-hidden">
                <div
                    className="absolute inset-0 bg-cover bg-center blur-3xl opacity-30 scale-110"
                    style={{ backgroundImage: `url(${series.info.cover})` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/80 to-transparent" />
                <div className="absolute inset-0 w-1/2 bg-gradient-to-r from-bg/80 to-transparent" />
            </div>

            <div className="relative z-10 px-6 md:px-10 lg:px-14 py-8">
                <Button variant="ghost" icon={ArrowLeft} onClick={() => router.back()} className="mb-8">
                    Voltar
                </Button>

                <div className="flex flex-col lg:flex-row space-y-10 lg:space-y-0 lg:space-x-16 items-start mb-14">
                    {/* Poster */}
                    <div className="w-full max-w-[300px] lg:max-w-[400px] flex-shrink-0 rounded-xl overflow-hidden shadow-2xl shadow-black/50 mx-auto lg:mx-0">
                        <img
                            src={series.info.cover}
                            alt={series.info.name}
                            className="w-full h-auto"
                            onError={(e) => e.currentTarget.src = 'https://via.placeholder.com/300x450?text=Sem+Capa'}
                        />
                    </div>

                    {/* Metadata */}
                    <div className="flex-1 space-y-6">
                        <h1 className="text-3xl md:text-5xl font-semibold tracking-tight leading-tight">{series.info.name}</h1>

                        <div className="flex flex-wrap items-center">
                            {series.info.releaseDate && (
                                <span className="mr-2 mb-2">
                                    <Badge>
                                        <Calendar size={14} className="mr-1.5" /> {series.info.releaseDate}
                                    </Badge>
                                </span>
                            )}
                            {series.info.rating && (
                                <span className="mr-2 mb-2 flex items-center text-sm text-ink-2 tnum">
                                    <Star size={16} className="mr-1 text-ink-2" fill="currentColor" /> {series.info.rating}
                                </span>
                            )}
                        </div>

                        <p className="text-sm md:text-base text-ink-2 leading-relaxed max-w-3xl">
                            {series.info.plot || "Nenhuma sinopse disponível."}
                        </p>

                        <div className="space-y-1 text-sm text-ink-2">
                            {series.info.genre && <p><span className="text-ink font-medium">Gênero:</span> {series.info.genre}</p>}
                            {series.info.cast && <p><span className="text-ink font-medium">Elenco:</span> {series.info.cast}</p>}
                            {series.info.director && <p><span className="text-ink font-medium">Diretor:</span> {series.info.director}</p>}
                        </div>

                        <div className="flex items-center space-x-3">
                            <IconButton
                                icon={Bookmark}
                                label={favorited ? 'Remover da minha lista' : 'Adicionar à minha lista'}
                                variant="secondary"
                                active={favorited}
                                onClick={() => {
                                    if (favorited) {
                                        removeFavorite(seriesId, 'series');
                                    } else {
                                        addFavorite({
                                            id: seriesId,
                                            type: 'series',
                                            name: series.info.name,
                                            image: series.info.cover,
                                            rating: series.info.rating
                                        });
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Episodes Section */}
                <div className="space-y-6">
                    {/* Batch subtitle search/download for the whole series */}
                    <div className="bg-surface-2 border border-line rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-sm font-semibold text-ink flex items-center">
                                <Subtitles size={15} className="mr-2 text-ink-3 flex-shrink-0" />
                                Legendas da série
                            </h2>
                            {subtitlesConfigured && remainingDownloads !== null && (
                                <Badge tone={remainingDownloads <= 0 ? 'warn' : 'ok'}>
                                    <span className="tnum">{remainingDownloads}</span> restante{remainingDownloads === 1 ? '' : 's'} hoje
                                </Badge>
                            )}
                        </div>

                        {subtitlesConfigResolved && !subtitlesConfigured ? (
                            /* No OpenSubtitles key yet — searching/downloading needs one, so lead
                               with the one action that unblocks everything else instead of
                               showing controls that would just fail. Settings lives on its own
                               page now (spec 02), not a modal, and is D-pad-reachable the same
                               way on a TV as in a browser — no separate path needed for either. */
                            <div className="flex flex-wrap items-center justify-between">
                                <p className="text-xs text-ink-2 mr-3">
                                    Configure o OpenSubtitles em Ajustes para buscar e baixar legendas.
                                </p>
                                <Link
                                    href="/dashboard/settings#legendas"
                                    data-focusable="true"
                                    tabIndex={0}
                                    className="inline-flex items-center h-9 px-3 rounded-lg bg-surface-3 text-ink text-sm font-medium flex-shrink-0"
                                >
                                    Abrir Ajustes
                                </Link>
                            </div>
                        ) : (
                            <>
                                {seriesHasSubs && (
                                    <p className="text-xs text-ink-2 mb-2">
                                        Episódio sem legenda baixa uma automaticamente ao abrir (consome a cota diária).
                                    </p>
                                )}

                                {/* flex gap needs Chrome 84+ (WebOS TVs lack it): child m-1.5 emulates gap-3 */}
                                <div className="flex flex-wrap items-end">
                                    <div className="w-full sm:w-48 m-1.5">
                                        <Field label="Idioma">
                                            <select
                                                value={batchLanguage}
                                                onChange={(e) => setBatchLanguage(e.target.value)}
                                                disabled={isBatchBusy}
                                                data-focusable={isBatchBusy ? undefined : 'true'}
                                                tabIndex={isBatchBusy ? undefined : 0}
                                                className={inputClassName}
                                            >
                                                {BATCH_LANGUAGES.map(lang => (
                                                    <option key={lang.code} value={lang.code}>{lang.label}</option>
                                                ))}
                                            </select>
                                        </Field>
                                    </div>

                                    <div className="m-1.5 flex items-center space-x-2">
                                        {isBatchBusy ? (
                                            <Button
                                                variant="ghost"
                                                icon={X}
                                                onClick={() => { batchCancelRef.current = true; }}
                                            >
                                                Cancelar
                                            </Button>
                                        ) : (
                                            <>
                                                <Button variant="secondary" icon={Search} onClick={handleBatchSearch}>
                                                    Buscar legendas
                                                </Button>
                                                {availableCount > 0 && (
                                                    <Button variant="secondary" icon={Download} onClick={handleBatchDownload}>
                                                        Baixar {availableCount} legenda{availableCount > 1 ? 's' : ''}
                                                    </Button>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    {batch && (
                                        <div className="m-1.5 flex items-center space-x-2 text-xs text-ink-2 tnum ml-auto">
                                            {isBatchBusy && <Loader2 size={14} className="animate-spin" />}
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
                                </div>
                            </>
                        )}
                    </div>

                    {/* Season selector */}
                    <div className="row-scroller flex items-center overflow-x-auto">
                        {seasons.map(season => (
                            <button
                                key={season}
                                type="button"
                                onClick={() => setActiveSeason(season)}
                                data-focusable="true"
                                tabIndex={0}
                                className={[
                                    'flex-shrink-0 mr-2 h-10 px-4 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                                    activeSeason === season ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2 border border-line',
                                ].join(' ')}
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
                            const status = availability[ep.id]?.status;

                            return (
                                <div key={ep.id} className="relative bg-surface border border-line rounded-xl p-4">
                                    <div className="flex items-start">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedEpisode(ep)}
                                            data-focusable="true"
                                            tabIndex={0}
                                            // A dense list row (bare content beside a sibling
                                            // IconButton, inside an already-rounded card): the
                                            // default ring picks up the button's own border-radius,
                                            // which is none, and the default scale can push the
                                            // row past the card's padding. `focus-flat` draws the
                                            // ring flush with no scale — the same treatment as
                                            // every other list row in the app (spec 00 §4) — and
                                            // rounded-lg keeps that ring from reading as a sharp
                                            // square inside the card's rounded-xl border.
                                            className="focus-flat flex-1 min-w-0 flex items-start text-left rounded-lg"
                                        >
                                            <div className="w-32 md:w-40 flex-shrink-0 mr-4">
                                                <div className="ratio ratio-wide rounded-lg overflow-hidden bg-surface-2">
                                                    {ep.info?.movie_image ? (
                                                        <img
                                                            src={ep.info.movie_image}
                                                            alt=""
                                                            className="ratio-fill object-cover"
                                                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                        />
                                                    ) : (
                                                        <div className="ratio-fill flex items-center justify-center text-ink-3">
                                                            <Play size={20} />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between">
                                                    <h4 className="text-sm md:text-base font-medium text-ink">
                                                        {ep.episode_num}. {ep.title}
                                                    </h4>
                                                    {ep.info?.duration && (
                                                        <span className="tnum text-xs text-ink-2 flex items-center flex-shrink-0 ml-2">
                                                            <Clock size={12} className="mr-1" /> {ep.info.duration}
                                                        </span>
                                                    )}
                                                </div>
                                                {ep.info?.plot && (
                                                    <p className="mt-1 text-xs md:text-sm text-ink-2 line-clamp-2">
                                                        {ep.info.plot}
                                                    </p>
                                                )}
                                                <div className="flex items-center mt-2">
                                                    {status === 'downloaded' && (
                                                        <Badge tone="ok"><Check size={12} className="mr-1" /> Legenda</Badge>
                                                    )}
                                                    {status === 'available' && (
                                                        <Badge>Disponível</Badge>
                                                    )}
                                                    {status === 'unavailable' && (
                                                        <Badge>Sem legenda</Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </button>

                                        <IconButton
                                            icon={Subtitles}
                                            label="Buscar legenda deste episódio"
                                            variant="secondary"
                                            className="ml-3 flex-shrink-0 focus-flat"
                                            onClick={() => {
                                                setSelectedEpisode(null);
                                                setShowSubtitlePanel(true);
                                                setSubtitleEpisodeContext({
                                                    seasonNumber: Number(ep.season || activeSeason),
                                                    episodeNumber: Number(ep.episode_num),
                                                    episodeRef: ep,
                                                });
                                            }}
                                        />
                                    </div>

                                    {/* Playback progress */}
                                    {progress && duration > 0 && currentTime > 0 && (
                                        <div className="absolute bottom-0 left-0 w-full h-1 bg-surface-3 rounded-b-xl overflow-hidden">
                                            <div
                                                className="h-full bg-brand"
                                                style={{ width: `${Math.min(percent, 100)}%` }}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {currentEpisodes.length === 0 && (
                            <EmptyState compact title="Nenhum episódio encontrado para esta temporada." />
                        )}
                    </div>
                </div>
            </div>

            {showSubtitlePanel && (
                <SubtitleSearchPanel
                    title={series.info.name}
                    year={series.info.releaseDate}
                    seasonNumber={getSubtitleEpisodeContext()?.seasonNumber || Number(activeSeason)}
                    episodeNumber={getSubtitleEpisodeContext()?.episodeNumber || 1}
                    parentTmdbId={parentTmdbId}
                    streamId={getSubtitleEpisodeContext()?.episodeRef?.id || String(seriesId)}
                    onSubtitleSelected={(url) => {
                        setSubtitleUrl(url);
                        // Auto-select the episode that was clicked for subtitle search
                        const epRef = getSubtitleEpisodeContext()?.episodeRef;
                        if (epRef) {
                            setSelectedEpisode(epRef);
                        }
                    }}
                    onClose={() => {
                        setShowSubtitlePanel(false);
                        setSubtitleEpisodeContext(null);
                    }}
                />
            )}
        </div>
    );
}
