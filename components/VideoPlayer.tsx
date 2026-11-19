'use client';

import { useEffect, useRef, useState, useCallback, type CSSProperties } from 'react';
import Hls from 'hls.js';
import { useNavigationOverride } from '@/app/context/NavigationContext';
import { useProfile } from '@/app/context/ProfileContext';
import { useT } from '@/app/context/I18nContext';
import { getDeviceProfile } from '@/app/lib/deviceProfile';
import { getChannelKeyDirection, getMediaKeyAction, isBackKey, isOkKey } from '@/app/lib/platform/keys';
import { usePlayerScrub } from '@/app/hooks/usePlayerScrub';
import { getDeviceToken, getServerBaseUrl } from '@/app/lib/apiClient';
import PlayerTopBar from '@/components/player/PlayerTopBar';
import PlayerControls from '@/components/player/PlayerControls';
import PlayerOverlays from '@/components/player/PlayerOverlays';
import NextEpisodePrompt from '@/components/player/NextEpisodePrompt';
import StartOverPrompt from '@/components/player/StartOverPrompt';
import type { SeekBarProps } from '@/components/player/SeekBar';

type VideoPreloadMode = 'auto' | 'metadata' | 'none';

interface PlaybackProfile {
    isConstrained: boolean;
    isTvDevice: boolean;
    preload: VideoPreloadMode;
    minBufferSec: number;
    fallbackMs: number;
    hls: {
        enableWorker: boolean;
        backBufferLength: number;
        maxBufferLength: number;
        startFragPrefetch: boolean;
        abrBandWidthFactor: number;
        abrBandWidthUpFactor: number;
        maxStarvationDelay: number;
        maxLoadingDelay: number;
    };
}

interface NavigatorConnectionInfo {
    effectiveType?: string;
    saveData?: boolean;
}

interface NavigatorWithConnection extends Navigator {
    connection?: NavigatorConnectionInfo;
}

interface WebKitFullscreenDocument extends Document {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => void;
}

interface WebKitVideoElement extends HTMLVideoElement {
    webkitDisplayingFullscreen?: boolean;
    webkitEnterFullscreen?: () => void;
    webkitExitFullscreen?: () => void;
}

interface WebKitFullscreenContainer extends HTMLDivElement {
    webkitRequestFullscreen?: () => void;
}

/** How long before the end of the episode the next-episode prompt appears. */
const NEXT_EPISODE_PROMPT_LEAD_SEC = 60;
/** Countdown, in video time, until the automatic skip. */
const NEXT_EPISODE_AUTO_SKIP_SEC = 10;
/** How much "Adiar" (snooze) pushes the prompt forward (short credits). */
const NEXT_EPISODE_POSTPONE_SEC = 60;
/**
 * The duration of progressive streams keeps being re-estimated (growing) as the
 * content is preloaded. We only trust it — and enable the next-episode
 * prompt/skip — after the video advanced this much WITHOUT the duration changing.
 * This way a partial estimate mid-video never triggers the automatic skip.
 */
const DURATION_STABLE_SEC = 6;
/** How close the playhead must land to the resume point to count as resumed. */
const RESUME_TOLERANCE_SEC = 3;
/** Re-seeks allowed before giving up on the resume point (webOS drops early seeks). */
const RESUME_MAX_ATTEMPTS = 6;
/** Minimum spacing between re-seeks, so a slow seek is not interrupted by the next. */
const RESUME_RETRY_INTERVAL_MS = 1000;
/** How long the "watch from the beginning" offer stays up after a resume. */
const START_OVER_PROMPT_MS = 10000;

function getPlaybackProfile(): PlaybackProfile {
    if (typeof window === 'undefined') {
        return {
            isConstrained: false,
            isTvDevice: false,
            preload: 'metadata',
            minBufferSec: 8,
            fallbackMs: 12000,
            hls: {
                enableWorker: true,
                backBufferLength: 90,
                maxBufferLength: 90,
                startFragPrefetch: true,
                abrBandWidthFactor: 0.92,
                abrBandWidthUpFactor: 0.4,
                maxStarvationDelay: 8,
                maxLoadingDelay: 10,
            },
        };
    }

    const deviceProfile = getDeviceProfile();
    const ua = navigator.userAgent.toLowerCase();
    const connection = (navigator as NavigatorWithConnection).connection;
    const effectiveType = connection?.effectiveType;
    const isSlowNetwork = connection?.saveData === true || effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g';
    const isTvDevice = /webos|web0s|tizen|smart-tv|smarttv|hbbtv|netcast/.test(ua);
    const isConstrained = deviceProfile.tier === 'low' || isSlowNetwork;
    const shouldConserveResources = isConstrained || isTvDevice;

    return {
        isConstrained,
        isTvDevice,
        preload: shouldConserveResources ? 'metadata' : 'auto',
        minBufferSec: isConstrained ? 12 : isTvDevice ? 10 : 8,
        fallbackMs: isConstrained ? 18000 : isTvDevice ? 15000 : 12000,
        hls: {
            enableWorker: !shouldConserveResources,
            backBufferLength: isConstrained ? 30 : isTvDevice ? 45 : 90,
            maxBufferLength: isConstrained ? 45 : isTvDevice ? 60 : 90,
            startFragPrefetch: !isConstrained,
            abrBandWidthFactor: isConstrained ? 0.8 : 0.92,
            abrBandWidthUpFactor: isConstrained ? 0.25 : 0.4,
            maxStarvationDelay: isConstrained ? 12 : 8,
            maxLoadingDelay: isConstrained ? 14 : 10,
        },
    };
}

interface VideoPlayerProps {
    src: string;
    poster?: string;
    autoPlay?: boolean;
    initialTime?: number;
    onProgress?: (currentTime: number, duration: number) => void;
    onMetadata?: (duration: number) => void;
    onNext?: () => void;
    onPrevious?: () => void;
    hasNext?: boolean;
    hasPrevious?: boolean;
    onBack?: () => void;
    subtitleUrl?: string;
    topRightSlot?: React.ReactNode;
    /** Title shown at the top of the player (e.g. movie/series/channel name). Hides with the controls. */
    title?: string;
    /** Subtitle at the top (e.g. "T1 · Ep 3 - Piloto"). */
    subtitle?: string;
    /** Recebe o elemento <video> (ou null ao desmontar) — usado para sincronizar players. */
    onVideoElement?: (el: HTMLVideoElement | null) => void;
    /**
     * Recebe a instância do hls.js (ou null). O relógio absoluto da transmissão
     * (`playingDate`, de EXT-X-PROGRAM-DATE-TIME) só existe nela, não no <video>.
     */
    onHlsInstance?: (hls: Hls | null) => void;
    /**
     * Modo TV: o stream carrega só uma janela deslizante do título, começando neste
     * ponto. Com `totalDuration`, a barra passa a mostrar o tempo real do filme em vez
     * do tamanho da janela (que cresce enquanto carrega).
     */
    timeOffset?: number;
    /** Duração real do título (s). Ativa o modo de linha do tempo absoluta. */
    totalDuration?: number;
    /**
     * Pedido de salto para fora da janela disponível (segundo absoluto do título).
     * Sem isso, a barra vira apenas indicador — arrastar não faz nada.
     */
    onSeekBeyondWindow?: (absoluteSeconds: number) => void;
    /**
     * Fired once when playback fails in a way that looks like a cross-origin (CORS)
     * block rather than a real playback error: hls.js fatal NETWORK_ERROR with no
     * HTTP status on the response (a blocked/opaque response never exposes one), or
     * a native `<video>` MediaError shaped the same way. Only considered when `src`
     * itself is cross-origin — a same-origin URL cannot fail on CORS. The caller
     * typically reacts by switching to a same-origin relay path (Modo TV).
     */
    onCorsFallback?: () => void;
    /**
     * Live only: switch to the previous (-1) or next (1) channel. Wired to the
     * remote's CH+/CH−, the transport Next/Previous keys, ↑/↓ while the
     * controls are hidden, and the control bar's channel buttons.
     */
    onChannelStep?: (direction: 1 | -1) => void;
    /** Extra on-video overlay (e.g. the live channel banner). */
    overlaySlot?: React.ReactNode;
}

/** True when `src` resolves to an origin other than the page's own. */
function isCrossOriginSrc(src: string): boolean {
    if (typeof window === 'undefined') return false;
    try {
        return new URL(src, window.location.href).origin !== window.location.origin;
    } catch {
        return false;
    }
}

/**
 * A native `<video>` MediaError that looks like a CORS block rather than a genuine
 * decode/format problem: `MEDIA_ERR_SRC_NOT_SUPPORTED` (the browser refused to even
 * probe the response), or `MEDIA_ERR_NETWORK` with no message (a blocked cross-origin
 * response carries no diagnostic detail).
 */
function looksLikeCorsMediaError(error: MediaError | null): boolean {
    if (!error) return false;
    if (error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) return true;
    return error.code === MediaError.MEDIA_ERR_NETWORK && !error.message;
}

const DEFAULT_SUBTITLE_FONT_SIZE = 1.5;

function clampFontSize(size: number): number {
    return Math.max(0.8, Math.min(2.5, size));
}

export default function VideoPlayer({
    src,
    poster,
    autoPlay = true,
    initialTime = 0,
    onProgress,
    onMetadata,
    onNext,
    onPrevious,
    hasNext = false,
    hasPrevious = false,
    onBack,
    subtitleUrl,
    topRightSlot,
    title,
    subtitle,
    onVideoElement,
    onHlsInstance,
    timeOffset = 0,
    totalDuration = 0,
    onSeekBeyondWindow,
    onCorsFallback,
    onChannelStep,
    overlaySlot,
}: VideoPlayerProps) {
    const { activeProfile, updatePrefs } = useProfile();
    const t = useT();
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [error, setError] = useState('');
    const [showControls, setShowControls] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    /** Has `duration` stopped being re-estimated (progressive finished preloading)? */
    const [durationStable, setDurationStable] = useState(false);
    const [isSeeking, setIsSeeking] = useState(false);
    const [isBuffering, setIsBuffering] = useState(false);
    const [bufferedPercent, setBufferedPercent] = useState(0);
    const [skipIndicator, setSkipIndicator] = useState<{ show: boolean; text: string }>({ show: false, text: '' });
    const [centerPlayPause, setCenterPlayPause] = useState<{ show: boolean; playing: boolean }>({ show: false, playing: false });
    const [subtitleFontSize, setSubtitleFontSize] = useState(() => {
        const saved = activeProfile?.prefs.subtitleFontSize;
        return Number.isFinite(saved) ? clampFontSize(saved as number) : DEFAULT_SUBTITLE_FONT_SIZE;
    });
    const [disabledSubtitleUrl, setDisabledSubtitleUrl] = useState<string | null>(null);
    const [isMetadataLoaded, setIsMetadataLoaded] = useState(false);
    const [preloadMode] = useState<VideoPreloadMode>(() => getPlaybackProfile().preload);
    const [showBufferingHelp, setShowBufferingHelp] = useState(false);
    const subtitlesEnabled = !subtitleUrl || disabledSubtitleUrl !== subtitleUrl;

    /** Prompt snooze, tied to the `src` that originated it — an episode change discards it by itself. */
    const [postponement, setPostponement] = useState<{ src: string; until: number } | null>(null);

    const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const skipIndicatorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const centerIconTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const nextEpisodePromptRef = useRef<HTMLDivElement>(null);
    const controlsOverlayRef = useRef<HTMLDivElement>(null);
    const startOverPromptRef = useRef<HTMLDivElement>(null);
    const startOverButtonRef = useRef<HTMLButtonElement>(null);
    /** Set when "continue watching" resumed mid-title; tied to its `src` so an episode change drops it. */
    const [startOver, setStartOver] = useState<{ src: string; from: number } | null>(null);
    const seekInputRef = useRef<HTMLInputElement>(null);
    const nextEpisodeButtonRef = useRef<HTMLButtonElement>(null);
    const postponeButtonRef = useRef<HTMLButtonElement>(null);
    const autoSkipFiredRef = useRef(false);
    /** Video time (s) at which `duration` last changed — to know when it stabilized. */
    const durationChangedAtTimeRef = useRef(0);

    const saveFontSize = useCallback((size: number) => {
        setSubtitleFontSize(size);
        updatePrefs({ subtitleFontSize: size });
    }, [updatePrefs]);

    const changeFontSize = useCallback((delta: number) => {
        saveFontSize(clampFontSize(subtitleFontSize + delta));
    }, [saveFontSize, subtitleFontSize]);

    const toggleSubtitles = useCallback(() => {
        if (!subtitleUrl) return;
        setDisabledSubtitleUrl(currentUrl => currentUrl === subtitleUrl ? null : subtitleUrl);
    }, [subtitleUrl]);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setShowBufferingHelp(isBuffering && !error);
        }, isBuffering && !error ? 15000 : 0);

        return () => window.clearTimeout(timeoutId);
    }, [isBuffering, error]);

    // Register custom back handler via navigation context
    useNavigationOverride(onBack ? () => {
        console.log('VideoPlayer::Custom back handler triggered');
        onBack();
    } : null);

    // Cross-platform fullscreen helpers
    // Unified Fullscreen Helpers
    const getFullscreenElement = useCallback((): Element | null => {
        const fullscreenDocument = document as WebKitFullscreenDocument;
        return document.fullscreenElement
            || fullscreenDocument.webkitFullscreenElement
            || null;
    }, []);

    const isCurrentlyFullscreen = useCallback(() => {
        const video = videoRef.current;
        const webkitVideo = video as WebKitVideoElement | null;
        return !!getFullscreenElement() || webkitVideo?.webkitDisplayingFullscreen === true;
    }, [getFullscreenElement]);

    const enterFullscreenMode = useCallback((isProgrammatic = false) => {
        const container = containerRef.current;
        const video = videoRef.current;
        if (!container || !video) return;

        // On iOS, readyState must be >= 1 for webkitEnterFullscreen to work.
        // If readyState is 0, we must NOT attempt it or it will crash.
        if (video.readyState < 1 && !isMetadataLoaded) {
            console.warn('[VideoPlayer] Cannot enter fullscreen: Metadata not loaded (readyState 0)');
            if (video.readyState === 0) video.load();
            return;
        }

        try {
            const webkitVideo = video as WebKitVideoElement;
            const webkitContainer = container as WebKitFullscreenContainer;

            // Priority 1: iOS Safari / Mobile Webkit on Video Element
            // Direct call is required synchronously during user gesture.
            if (webkitVideo.webkitEnterFullscreen) {
                webkitVideo.webkitEnterFullscreen();
                return;
            }

            // Priority 2: Standard API on container (Desktop, Android)
            if (container.requestFullscreen) {
                container.requestFullscreen().catch((err) => {
                    // Fail silently for programmatic calls, log for interactive
                    if (!isProgrammatic) console.warn('[VideoPlayer] requestFullscreen failed:', err);
                });
            }
            // Priority 3: Older Webkit container request
            else if (webkitContainer.webkitRequestFullscreen) {
                webkitContainer.webkitRequestFullscreen();
            }
        } catch (e) {
            if (!isProgrammatic) console.error('[VideoPlayer] Fullscreen attempt failed:', e);
        }
    }, [isMetadataLoaded]);

    const exitFullscreenMode = useCallback(() => {
        try {
            const fullscreenDocument = document as WebKitFullscreenDocument;
            const webkitVideo = videoRef.current as WebKitVideoElement | null;

            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (fullscreenDocument.webkitExitFullscreen) {
                fullscreenDocument.webkitExitFullscreen();
            } else if (webkitVideo?.webkitExitFullscreen) {
                webkitVideo.webkitExitFullscreen();
            }
        } catch (e) {
            console.error('[VideoPlayer] Exit fullscreen error:', e);
        }
    }, []);

    const toggleFullscreen = useCallback(() => {
        if (!isCurrentlyFullscreen()) {
            enterFullscreenMode(false); // Interactive
        } else {
            exitFullscreenMode();
        }
    }, [isCurrentlyFullscreen, enterFullscreenMode, exitFullscreenMode]);

    // Fullscreen State Synchronization
    useEffect(() => {
        const video = videoRef.current;

        const updateFullscreenState = () => {
            const isFs = isCurrentlyFullscreen();
            setIsFullscreen(isFs);
            console.log('[VideoPlayer] Fullscreen state updated:', isFs);
        };

        // Standard and Webkit prefixed events for document/container level changes
        document.addEventListener('fullscreenchange', updateFullscreenState);
        document.addEventListener('webkitfullscreenchange', updateFullscreenState);

        // iOS specific events for native video player fullscreen
        if (video) {
            video.addEventListener('webkitbeginfullscreen', updateFullscreenState);
            video.addEventListener('webkitendfullscreen', updateFullscreenState);
        }

        return () => {
            document.removeEventListener('fullscreenchange', updateFullscreenState);
            document.removeEventListener('webkitfullscreenchange', updateFullscreenState);
            if (video) {
                video.removeEventListener('webkitbeginfullscreen', updateFullscreenState);
                video.removeEventListener('webkitendfullscreen', updateFullscreenState);
            }
        };
    }, [isCurrentlyFullscreen]);

    /**
     * True once the resume position (`initialTime`) is confirmed under the
     * playhead — or abandoned, or overridden by a seek of the user's own.
     * Progress is not reported before that (see the setup effect).
     */
    const hasAppliedInitialTime = useRef(false);
    const onProgressRef = useRef(onProgress);
    const onMetadataRef = useRef(onMetadata);
    const onNextRef = useRef(onNext);
    const onPreviousRef = useRef(onPrevious);
    const onBackRef = useRef(onBack);
    const isSeekingRef = useRef(isSeeking);

    useEffect(() => {
        onProgressRef.current = onProgress;
        onMetadataRef.current = onMetadata;
        onNextRef.current = onNext;
        onPreviousRef.current = onPrevious;
        onBackRef.current = onBack;
    }, [onProgress, onMetadata, onNext, onPrevious, onBack]);

    useEffect(() => {
        isSeekingRef.current = isSeeking;
    }, [isSeeking]);

    // Hands the <video> element to the parent (player sync) — stable across the lifecycle.
    const onVideoElementRef = useRef(onVideoElement);
    useEffect(() => { onVideoElementRef.current = onVideoElement; }, [onVideoElement]);
    const onHlsInstanceRef = useRef(onHlsInstance);
    useEffect(() => { onHlsInstanceRef.current = onHlsInstance; }, [onHlsInstance]);
    const onCorsFallbackRef = useRef(onCorsFallback);
    useEffect(() => { onCorsFallbackRef.current = onCorsFallback; }, [onCorsFallback]);
    /** Guards `onCorsFallback` to fire at most once per `src` — never a retry loop. */
    const corsFallbackFiredForSrcRef = useRef<string | null>(null);
    useEffect(() => {
        onVideoElementRef.current?.(videoRef.current);
        return () => onVideoElementRef.current?.(null);
    }, []);

    // Marks at which video point `duration` changed (only re-runs when the value actually changes).
    useEffect(() => {
        durationChangedAtTimeRef.current = videoRef.current?.currentTime ?? 0;
    }, [duration]);

    /** TV Mode: the stream is a sliding window over a title whose real length we know. */
    const isBroadcastTimeline = totalDuration > 0;
    const displayTime = isBroadcastTimeline ? timeOffset + currentTime : currentTime;
    const displayDuration = isBroadcastTimeline ? totalDuration : duration;
    // In Modo TV the stream's own duration is just the sliding window (a few seconds,
    // and growing) — the title's real timeline comes from the offset + known duration.
    const isLive = isBroadcastTimeline ? false : (duration === Infinity || duration === 0);

    // Next-episode prompt: series only (onNext + hasNext), never on live/unknown duration.
    // Everything is anchored to the title's timeline, so the countdown freezes on pause and
    // rewinds on seek — and while broadcasting it follows the title, not the relay window.
    const postponedUntil = postponement?.src === src ? postponement.until : 0;
    const nextEpisodePromptAt = Math.max(displayDuration - NEXT_EPISODE_PROMPT_LEAD_SEC, postponedUntil);
    const autoSkipAt = nextEpisodePromptAt + NEXT_EPISODE_AUTO_SKIP_SEC;
    const showNextEpisodePrompt = Boolean(onNext)
        && hasNext
        && Number.isFinite(displayDuration)
        && displayDuration > NEXT_EPISODE_PROMPT_LEAD_SEC
        // The stability guard exists for progressive streams that re-estimate their
        // duration; the broadcast length comes from the provider and needs no warm-up.
        && (isBroadcastTimeline || durationStable)
        && displayTime >= nextEpisodePromptAt
        && displayTime < displayDuration;
    const autoSkipSecondsLeft = Math.max(0, Math.ceil(autoSkipAt - displayTime));

    // The prompt stays visible until `src` changes, so it locks against firing `onNext` twice.
    useEffect(() => {
        if (!showNextEpisodePrompt) {
            autoSkipFiredRef.current = false;
            return;
        }
        if (displayTime < autoSkipAt || autoSkipFiredRef.current) return;
        autoSkipFiredRef.current = true;
        onNextRef.current?.();
    }, [showNextEpisodePrompt, displayTime, autoSkipAt]);

    const handlePostponeNextEpisode = useCallback(() => {
        const videoTime = videoRef.current?.currentTime ?? 0;
        const timelineTime = isBroadcastTimeline ? timeOffset + videoTime : videoTime;
        setPostponement({ src, until: timelineTime + NEXT_EPISODE_POSTPONE_SEC });
    }, [src, isBroadcastTimeline, timeOffset]);

    /** Arrows move between the two buttons while focus is on the prompt; outside it they keep seeking the video. */
    const moveNextEpisodePromptFocus = useCallback((direction: 'left' | 'right') => {
        const prompt = nextEpisodePromptRef.current;
        if (!prompt || !prompt.contains(document.activeElement)) return false;
        const target = direction === 'right' ? postponeButtonRef.current : nextEpisodeButtonRef.current;
        target?.focus();
        return true;
    }, []);

    // Show skip indicator
    const showSkipFeedback = useCallback((seconds: number) => {
        const text = seconds > 0 ? `+${seconds}s` : `${seconds}s`;
        setSkipIndicator({ show: true, text });

        if (skipIndicatorTimeoutRef.current) {
            clearTimeout(skipIndicatorTimeoutRef.current);
        }

        skipIndicatorTimeoutRef.current = setTimeout(() => {
            setSkipIndicator({ show: false, text: '' });
        }, 800);
    }, []);

    // Show center play/pause icon
    const showCenterIcon = useCallback((playing: boolean) => {
        setCenterPlayPause({ show: true, playing });

        if (centerIconTimeoutRef.current) {
            clearTimeout(centerIconTimeoutRef.current);
        }

        centerIconTimeoutRef.current = setTimeout(() => {
            setCenterPlayPause({ show: false, playing });
        }, 500);
    }, []);

    const togglePlay = useCallback(() => {
        if (videoRef.current) {
            if (videoRef.current.paused) {
                videoRef.current.play();
                showCenterIcon(true);
            } else {
                videoRef.current.pause();
                showCenterIcon(false);
            }
        }
    }, [showCenterIcon]);

    /**
     * Seeks using the title's own timeline (Modo TV). Only ~30s of the title exists on
     * disk at a time, so a jump inside that window is a normal seek, and anything else
     * has to be delegated: the upstream must be re-read from the new point.
     */
    const seekToAbsolute = useCallback((absolute: number) => {
        const video = videoRef.current;
        if (!video) return;

        const target = Math.max(0, Math.min(absolute, totalDuration));
        const local = target - timeOffset;

        if (video.seekable.length > 0) {
            const windowStart = video.seekable.start(0);
            const windowEnd = video.seekable.end(video.seekable.length - 1);
            if (local >= windowStart && local <= windowEnd) {
                video.currentTime = local;
                setCurrentTime(local);
                return;
            }
        }
        onSeekBeyondWindow?.(target);
    }, [timeOffset, totalDuration, onSeekBeyondWindow]);

    const handleSeek = useCallback((time: number) => {
        // The user picked a position: the pending resume must not drag it back.
        hasAppliedInitialTime.current = true;
        if (isBroadcastTimeline) {
            seekToAbsolute(time);
            return;
        }
        setCurrentTime(time);
        if (videoRef.current) {
            videoRef.current.currentTime = time;
        }
    }, [isBroadcastTimeline, seekToAbsolute]);

    /** Playhead on the displayed timeline (title time in Modo TV), read fresh from the element. */
    const getDisplayTime = useCallback(() => {
        const videoTime = videoRef.current?.currentTime ?? 0;
        return isBroadcastTimeline ? timeOffset + videoTime : videoTime;
    }, [isBroadcastTimeline, timeOffset]);

    const { scrub, scrubRef, step: scrubStep, release: releaseScrub, commit: commitScrub, cancel: cancelScrub } = usePlayerScrub({
        getCurrentTime: getDisplayTime,
        duration: displayDuration,
        onCommit: handleSeek,
    });
    const isScrubbing = scrub !== null;

    // A pending preview belongs to the title it was started on.
    useEffect(() => {
        cancelScrub();
    }, [src, cancelScrub]);

    useEffect(() => {
        // Never yank focus off the seek bar mid-scrub: the user is choosing a position.
        if (showNextEpisodePrompt && !scrubRef.current) {
            nextEpisodeButtonRef.current?.focus();
        }
    }, [showNextEpisodePrompt, scrubRef]);

    // "Watch from the beginning": offered for a few seconds after a resume.
    const showStartOver = startOver !== null && startOver.src === src && !showNextEpisodePrompt;

    useEffect(() => {
        if (!startOver) return;
        const timer = window.setTimeout(() => setStartOver(null), START_OVER_PROMPT_MS);
        return () => window.clearTimeout(timer);
    }, [startOver]);

    // Focus goes to the offer so one OK restarts — but only if the remote is
    // idle: a user already scrubbing or moving through the controls keeps
    // their place.
    useEffect(() => {
        if (showStartOver && !scrubRef.current && document.activeElement === document.body) {
            startOverButtonRef.current?.focus();
        }
    }, [showStartOver, scrubRef]);

    const handleStartOver = useCallback(() => {
        setStartOver(null);
        handleSeek(0);
    }, [handleSeek]);

    const skip = useCallback((seconds: number) => {
        if (!videoRef.current) return;
        hasAppliedInitialTime.current = true;
        if (isBroadcastTimeline) {
            seekToAbsolute(timeOffset + videoRef.current.currentTime + seconds);
        } else {
            videoRef.current.currentTime += seconds;
        }
        showSkipFeedback(seconds);
    }, [showSkipFeedback, isBroadcastTimeline, seekToAbsolute, timeOffset]);

    const jumpToPercent = useCallback((percent: number) => {
        hasAppliedInitialTime.current = true;
        if (isBroadcastTimeline) {
            seekToAbsolute((percent / 100) * totalDuration);
            return;
        }
        if (videoRef.current && duration > 0) {
            const targetTime = (percent / 100) * duration;
            videoRef.current.currentTime = targetTime;
        }
    }, [duration, isBroadcastTimeline, seekToAbsolute, totalDuration]);

    // Read through a ref so a hide timer armed while paused (e.g. a mouse move
    // before autoplay kicks in) still sees the current state when it fires.
    const isPlayingRef = useRef(isPlaying);

    const showControlsRef = useRef(showControls);
    useEffect(() => { showControlsRef.current = showControls; }, [showControls]);

    /**
     * Hides the overlay and drops focus out of it. A control keeping focus while
     * invisible would turn the next OK into a blind click (fullscreen, next
     * episode…); with focus released, the next key press only wakes the controls.
     */
    const hideControls = useCallback(() => {
        showControlsRef.current = false;
        setShowControls(false);
        const active = document.activeElement;
        if (active instanceof HTMLElement && controlsOverlayRef.current?.contains(active)) {
            active.blur();
        }
    }, []);

    const scheduleControlsHide = useCallback(() => {
        if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
        }

        controlsTimeoutRef.current = setTimeout(() => {
            // A scrub in progress keeps the bar up; its commit re-arms the timer.
            if (isPlayingRef.current && !scrubRef.current) hideControls();
        }, 3000);
    }, [hideControls, scrubRef]);

    const handleInteraction = useCallback(() => {
        showControlsRef.current = true;
        setShowControls(true);
        scheduleControlsHide();
    }, [scheduleControlsHide]);

    // Playback starting (autoplay, play key, sync command) is not a user
    // interaction, so arm the auto-hide here too — otherwise the controls stay
    // up until the next mouse move/key press. (Pausing brings them back — see
    // updatePlayState in the setup effect.)
    useEffect(() => {
        isPlayingRef.current = isPlaying;
        if (isPlaying) scheduleControlsHide();
    }, [isPlaying, scheduleControlsHide]);

    useEffect(() => {
        if (!isScrubbing) scheduleControlsHide();
    }, [isScrubbing, scheduleControlsHide]);

    useEffect(() => () => {
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    }, []);

    // Remote / keyboard controls.
    //
    // Registered on window in the CAPTURE phase so it runs before the global
    // D-pad navigator (useTvNavigation, a bubble listener) and can claim a key
    // outright with stopPropagation. Keys it does not claim — arrows between
    // the control-bar buttons, Back when there is nothing to undo — fall
    // through to the navigator untouched.
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const container = containerRef.current;
            if (!container) return;

            const active = document.activeElement;
            const hasFocus = active instanceof HTMLElement && active !== document.body;
            // A modal (diagnostics, broadcast start…) owns the remote while open.
            if (hasFocus && active.closest('[role="dialog"]')) return;
            // Focus on page UI outside the player: not ours to drive.
            if (hasFocus && !container.contains(active)) return;
            if (active instanceof HTMLTextAreaElement) return;
            // The error screen is plain D-pad navigation (diagnostics, Back).
            if (error) return;

            const claim = () => {
                e.preventDefault();
                e.stopPropagation();
            };

            const key = e.key.toLowerCase();
            const isLeft = key === 'arrowleft';
            const isRight = key === 'arrowright';
            const isVertical = key === 'arrowup' || key === 'arrowdown';
            const isOk = isOkKey(e);
            const isBack = isBackKey(e);
            const canScrub = !isLive;
            const seekInput = seekInputRef.current;
            const onSeekBar = hasFocus && seekInput !== null && active === seekInput;
            const inPrompt = hasFocus && Boolean(nextEpisodePromptRef.current?.contains(active));
            // OK on the start-over offer restarts the title; arrows leave it
            // and behave as usual (wake, scrub).
            const inStartOver = hasFocus && Boolean(startOverPromptRef.current?.contains(active));

            // Where the D-pad cursor lands when the controls come up: the
            // timeline on VOD (so Left/Right scrub right away), play/pause on live.
            const focusEntryPoint = () => {
                const target = canScrub && seekInput
                    ? seekInput
                    : container.querySelector<HTMLElement>('[data-player-primary="true"]');
                target?.focus();
            };

            const wasHidden = !showControlsRef.current;

            // Back: undo the innermost thing first — a pending scrub, then the
            // visible controls — and only then let the navigator leave the player.
            if (isBack) {
                if (showStartOver) {
                    claim();
                    setStartOver(null);
                    return;
                }
                if (scrubRef.current) {
                    claim();
                    cancelScrub();
                    handleInteraction();
                    return;
                }
                // Read the element, not isPlaying: right after a play/pause the
                // state is still a render behind.
                const playing = Boolean(videoRef.current && !videoRef.current.paused);
                if (!wasHidden && playing && !inPrompt && !document.fullscreenElement) {
                    claim();
                    hideControls();
                    return;
                }
                return;
            }

            // Channel zapping (live). Handled before the wake below: like a TV
            // set, flipping channels shows only the channel banner, not the
            // whole control bar.
            if (isLive && onChannelStep) {
                const media = getMediaKeyAction(e);
                const zapDirection = getChannelKeyDirection(e)
                    ?? (media === 'next' ? 1 : media === 'previous' ? -1 : null)
                    ?? ((wasHidden || !hasFocus) && !inPrompt && isVertical ? (key === 'arrowup' ? 1 : -1) : null);
                if (zapDirection !== null) {
                    claim();
                    onChannelStep(zapDirection);
                    return;
                }
            }

            // Any other key wakes the controls and restarts the auto-hide timer.
            handleInteraction();

            // Dedicated transport keys on a TV remote carry an explicit intent,
            // so they act regardless of what is focused.
            const mediaAction = getMediaKeyAction(e);
            if (mediaAction) {
                claim();
                switch (mediaAction) {
                    case 'playpause':
                        togglePlay();
                        break;
                    case 'play':
                        if (videoRef.current?.paused) togglePlay();
                        break;
                    case 'pause':
                        if (videoRef.current && !videoRef.current.paused) togglePlay();
                        break;
                    case 'stop':
                        if (videoRef.current && !videoRef.current.paused) togglePlay();
                        onBackRef.current?.();
                        break;
                    case 'forward':
                    case 'rewind': {
                        const direction = mediaAction === 'forward' ? 1 : -1;
                        if (canScrub) {
                            scrubStep(direction);
                        } else {
                            skip(direction * 10);
                        }
                        break;
                    }
                    case 'next':
                        onNextRef.current?.();
                        break;
                    case 'previous':
                        onPreviousRef.current?.();
                        break;
                }
                return;
            }

            const isArrow = isLeft || isRight || isVertical;

            // Wake press: with the controls hidden (or nothing focused, e.g.
            // after mouse use), a D-pad key never acts on an invisible control.
            // Left/Right go straight into a scrub, the others just reveal.
            // The next-episode prompt keeps its focus and is handled below.
            if ((wasHidden || !hasFocus || inStartOver) && !inPrompt && (isArrow || (isOk && !inStartOver))) {
                claim();
                focusEntryPoint();
                if ((isLeft || isRight) && canScrub) {
                    scrubStep(isRight ? 1 : -1);
                } else if (isOk) {
                    togglePlay();
                }
                return;
            }

            // Seek bar: Left/Right move the preview (accelerating while held),
            // OK applies it (or toggles play), Down goes to the buttons.
            if (onSeekBar) {
                if (isLeft || isRight) {
                    claim();
                    scrubStep(isRight ? 1 : -1);
                    return;
                }
                if (isOk) {
                    claim();
                    if (scrubRef.current) {
                        commitScrub();
                    } else {
                        togglePlay();
                    }
                    return;
                }
                if (key === 'arrowdown') {
                    claim();
                    commitScrub();
                    container.querySelector<HTMLElement>('[data-player-primary="true"]')?.focus();
                    return;
                }
                if (key === 'arrowup') {
                    // Leaving the bar applies what the user picked; the
                    // navigator then moves up to the top bar.
                    commitScrub();
                    return;
                }
            }

            // Down from the top bar lands on the timeline. Left to geometry, the
            // full-width bar loses to whichever button sits under the focused one.
            if (key === 'arrowdown' && canScrub && seekInput && hasFocus && active.closest('[data-player-topbar]')) {
                claim();
                seekInput.focus();
                return;
            }

            // Next-episode prompt: Left/Right swap between its two buttons;
            // Up/Down escape to the navigator.
            if (inPrompt && (isLeft || isRight)) {
                claim();
                moveNextEpisodePromptFocus(isRight ? 'right' : 'left');
                return;
            }

            // OK on a focused control. webOS does not reliably synthesize a
            // `click` from an Enter press, so a D-pad-focused button never
            // activated by remote: preventDefault() suppresses the native
            // activation where it does happen (desktop), then one manual
            // click fires everywhere.
            if (isOk) {
                claim();
                const control = hasFocus
                    ? active.closest<HTMLElement>('button, a, [role="button"], [data-focusable="true"]')
                    : null;
                if (control) {
                    control.click();
                } else {
                    togglePlay();
                }
                return;
            }

            // Arrows on a visible, focused control move the D-pad cursor
            // between buttons — the navigator's job.
            if (isArrow) return;

            switch (key) {
                case ' ':
                    // Claiming keydown also stops the focused button's own
                    // Space activation, which would toggle a second time.
                    claim();
                    togglePlay();
                    break;
                case 'f':
                    claim();
                    toggleFullscreen();
                    break;
                case 'c':
                    claim();
                    toggleSubtitles();
                    break;
                case ']':
                    claim();
                    changeFontSize(0.1);
                    break;
                case '[':
                    claim();
                    changeFontSize(-0.1);
                    break;
                case '0':
                case '1':
                case '2':
                case '3':
                case '4':
                case '5':
                case '6':
                case '7':
                case '8':
                case '9':
                    claim();
                    cancelScrub();
                    jumpToPercent(parseInt(e.key, 10) * 10);
                    break;
            }
        };

        // Ends the hold, so the scrub applies shortly after the key comes up.
        const handleKeyUp = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            const action = getMediaKeyAction(e);
            if (key === 'arrowleft' || key === 'arrowright' || action === 'forward' || action === 'rewind') {
                releaseScrub();
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);
        window.addEventListener('keyup', handleKeyUp, true);
        return () => {
            window.removeEventListener('keydown', handleKeyDown, true);
            window.removeEventListener('keyup', handleKeyUp, true);
        };
    }, [
        togglePlay, skip, toggleFullscreen, jumpToPercent, changeFontSize,
        toggleSubtitles, moveNextEpisodePromptFocus, error, isLive, scrubRef, scrubStep, releaseScrub,
        commitScrub, cancelScrub, handleInteraction, hideControls, onChannelStep, showStartOver,
    ]);

    // Video setup and HLS — deps only [src, autoPlay]: initialTime enters only as a snapshot (seekTarget) on source change; callbacks via refs (avoids checkpoint loop).
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const seekTarget = initialTime > 0 ? initialTime : 0;

        const resetPlaybackStateTimer = window.setTimeout(() => {
            const hasPlayableData = video.readyState >= 3 || !video.paused;
            setError('');
            setCurrentTime(0);
            setDuration(0);
            setDurationStable(false);
            setIsBuffering(!hasPlayableData);
            setIsMetadataLoaded(false);
            setShowBufferingHelp(false);
        }, 0);
        hasAppliedInitialTime.current = false;

        const playbackProfile = getPlaybackProfile();
        video.preload = playbackProfile.preload;

        const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
        const isLegacyWebOs = /webos|web0s/.test(userAgent) && playbackProfile.isConstrained;
        const isHLS = src.toLowerCase().includes('.m3u8');
        const isDirectVideo = /\.(mp4|mkv|avi|webm|mov)$/i.test(src.split('?')[0]);
        const isProviderLive = isHLS && /\/live\//i.test(src);
        // Modo TV: our own ffmpeg relay is just as live (sliding window, no ENDLIST),
        // but its URL has no "/live/" — so it used to fall through to the VOD tuning
        // and inherit hls.js defaults, most damagingly an unbounded live latency.
        const isBroadcastRelay = isHLS && src.includes('/api/relay/vod/');
        const isLiveHls = isProviderLive || isBroadcastRelay;
        const supportsNativeHls = isHLS && (
            video.canPlayType('application/vnd.apple.mpegurl') !== '' ||
            video.canPlayType('application/x-mpegURL') !== ''
        );
        // The VOD relay delivers ffmpeg-generated fMP4, which NATIVE HLS on several
        // devices refuses (DEMUXER_ERROR_COULD_NOT_PARSE). hls.js (MSE) consumes it
        // reliably. (The live relay serves the provider original segments,
        // which native accepts — so we only force hls.js for VOD.)
        const isVodRelay = /\/api\/relay\/vod\//i.test(src);
        const preferHlsJs = isVodRelay && Hls.isSupported();
        const useNativeHls = isHLS && !preferHlsJs && (supportsNativeHls || isLegacyWebOs);
        const useHlsJs = isHLS && !useNativeHls && Hls.isSupported();

        let hls: Hls | undefined;
        const playSettleTimers: number[] = [];
        /** Cancela espera por buffer antes do autoplay (progress/canplay + timeout). */
        let cancelBufferedAutoplayWait: (() => void) | undefined;
        /** While true, `canplay` does not clear the spinner (autoplay waiting for minimum buffer). */
        let autoplayAwaitBuffer = false;

        const bufferedAheadSeconds = (v: HTMLVideoElement): number => {
            if (v.buffered.length === 0) return 0;
            const t = v.currentTime;
            for (let i = 0; i < v.buffered.length; i++) {
                const start = v.buffered.start(i);
                const end = v.buffered.end(i);
                if (t >= start && t <= end) return end - t;
            }
            return Math.max(0, v.buffered.end(v.buffered.length - 1) - t);
        };

        // Resume ("continuar assistindo"). A single seek at loadedmetadata is
        // enough on desktop, but webOS's media pipeline silently drops a
        // currentTime set before playback has really started (and can reset
        // to 0 on play()), so the TV used to start from the beginning — and
        // then overwrite the saved position with ~0. The seek is re-applied
        // until the playhead is really there, and progress stays unreported
        // until then.
        let resumeAttempts = 0;
        let lastResumeAttemptAt = 0;
        const resumePending = () => seekTarget > 0 && !hasAppliedInitialTime.current;

        const applyInitialSeek = () => {
            if (!resumePending() || video.readyState < 1) return;
            if (resumeAttempts >= RESUME_MAX_ATTEMPTS) {
                console.warn('[VideoPlayer] Resume position never stuck; playing from where the player is.');
                hasAppliedInitialTime.current = true;
                return;
            }
            resumeAttempts += 1;
            lastResumeAttemptAt = Date.now();
            console.log('[VideoPlayer] Seeking to initial time:', seekTarget, `(attempt ${resumeAttempts})`);
            try {
                video.currentTime = seekTarget;
            } catch (e) {
                console.warn('[VideoPlayer] Initial seek rejected:', e);
            }
        };

        const confirmResume = () => {
            if (!resumePending() || video.readyState < 1) return;
            if (video.currentTime >= seekTarget - RESUME_TOLERANCE_SEC) {
                hasAppliedInitialTime.current = true;
                setStartOver({ src, from: seekTarget });
                return;
            }
            if (video.seeking || Date.now() - lastResumeAttemptAt < RESUME_RETRY_INTERVAL_MS) return;
            applyInitialSeek();
        };

        const safePlay = () => {
            try {
                const playResult = video.play() as Promise<void> | undefined;
                const settleTimer = window.setTimeout(() => {
                    if (!video.paused || video.readyState >= 2) {
                        setIsBuffering(false);
                    }
                }, 1500);
                playSettleTimers.push(settleTimer);

                if (playResult && typeof playResult.catch === 'function') {
                    playResult.catch(e => {
                        console.warn('[VideoPlayer] Play failed:', e);
                        setIsBuffering(false);
                        setShowControls(true);
                        setShowBufferingHelp(true);
                    });
                }
            } catch (e) {
                console.warn('[VideoPlayer] Play failed:', e);
                setIsBuffering(false);
                setShowControls(true);
                setShowBufferingHelp(true);
            }
        };

        const waitForBufferedAutoplay = () => {
            if (!autoPlay) {
                setIsBuffering(false);
                return;
            }

            autoplayAwaitBuffer = true;

            const tryPlayWhenBuffered = () => {
                const ahead = bufferedAheadSeconds(video);
                if (ahead >= playbackProfile.minBufferSec) {
                    cancelBufferedAutoplayWait?.();
                    safePlay();
                }
            };

            const timeoutId = window.setTimeout(() => {
                cancelBufferedAutoplayWait?.();
                safePlay();
            }, playbackProfile.fallbackMs);

            cancelBufferedAutoplayWait = () => {
                autoplayAwaitBuffer = false;
                window.clearTimeout(timeoutId);
                video.removeEventListener('progress', tryPlayWhenBuffered);
                video.removeEventListener('canplay', tryPlayWhenBuffered);
                video.removeEventListener('loadeddata', tryPlayWhenBuffered);
                cancelBufferedAutoplayWait = undefined;
            };

            video.addEventListener('progress', tryPlayWhenBuffered);
            video.addEventListener('canplay', tryPlayWhenBuffered);
            video.addEventListener('loadeddata', tryPlayWhenBuffered);
            tryPlayWhenBuffered();
        };

        const setupVideoHls = () => {
            applyInitialSeek();
            if (!autoPlay) {
                setIsBuffering(false);
            } else if (isLiveHls || playbackProfile.isTvDevice) {
                safePlay();
            } else {
                waitForBufferedAutoplay();
            }
        };

        if (useHlsJs) {
            console.log('[VideoPlayer] Initializing HLS.js for:', src, playbackProfile);
            // Tune CPU/RAM/buffer for TVs and slow connections.
            hls = new Hls({
                enableWorker: playbackProfile.hls.enableWorker,
                lowLatencyMode: false,
                // VOD over hls.js starts loading at the resume point instead of
                // fetching the opening segments and seeking away from them.
                ...(!isLiveHls && seekTarget > 0 ? { startPosition: seekTarget } : {}),
                backBufferLength: isLiveHls ? Math.min(45, playbackProfile.hls.backBufferLength) : playbackProfile.hls.backBufferLength,
                maxBufferLength: isLiveHls ? Math.min(50, playbackProfile.hls.maxBufferLength) : playbackProfile.hls.maxBufferLength,
                maxBufferHole: 0.25,
                startFragPrefetch: playbackProfile.hls.startFragPrefetch,
                capLevelToPlayerSize: true,
                abrBandWidthFactor: playbackProfile.hls.abrBandWidthFactor,
                abrBandWidthUpFactor: playbackProfile.hls.abrBandWidthUpFactor,
                maxStarvationDelay: playbackProfile.hls.maxStarvationDelay,
                maxLoadingDelay: playbackProfile.hls.maxLoadingDelay,
                // The packaged TV client plays through a cross-origin relay that
                // authenticates by device token. No token (web build) = no-op.
                xhrSetup: (xhr: XMLHttpRequest, url: string) => {
                    const token = getDeviceToken();
                    const base = getServerBaseUrl();
                    if (token && base && url.indexOf(base) === 0) {
                        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                    }
                },
                ...(isLiveHls
                    ? {
                          liveDurationInfinity: true,
                          // Counted in segments, so each source needs its own numbers.
                          // Our relay window is 10 segments (hls_list_size) of ~4-7s:
                          // sit 3 back (near the middle) and only force-seek to the edge
                          // past 8. The gap between 3 and 8 is slack a transient buffer
                          // dip is played through instead of yanking the picture forward
                          // (the "video jumps on its own" while broadcasting). Bounding
                          // the latency at all is still what makes the devices converge —
                          // the default is Infinity, so a device that stalled once stayed
                          // behind for good and only a manual sync could rescue it.
                          liveSyncDurationCount: isBroadcastRelay ? 3 : 5,
                          liveMaxLatencyDurationCount: isBroadcastRelay ? 8 : 14,
                          initialLiveManifestSize: 2,
                      }
                    : {}),
            });

            hls.loadSource(src);
            hls.attachMedia(video);
            onHlsInstanceRef.current?.(hls);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                console.log('[VideoPlayer] HLS Manifest parsed.');
                setupVideoHls();
            });

            hls.on(Hls.Events.ERROR, (_event, data) => {
                console.error('[VideoPlayer] HLS Error:', data.type, data.details, data.fatal ? '(FATAL)' : '');
                if (data.fatal) {
                    // A blocked cross-origin request never reaches an HTTP status: hls.js
                    // reports it as a NETWORK_ERROR on the manifest/level/fragment loader with
                    // no `response.code`. A real 4xx/5xx from the provider always carries one,
                    // so this only matches the CORS shape, not ordinary upstream failures.
                    const looksLikeCors = data.type === Hls.ErrorTypes.NETWORK_ERROR
                        && (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR
                            || data.details === Hls.ErrorDetails.LEVEL_LOAD_ERROR
                            || data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR)
                        && !data.response?.code;

                    if (looksLikeCors && isCrossOriginSrc(src) && corsFallbackFiredForSrcRef.current !== src) {
                        corsFallbackFiredForSrcRef.current = src;
                        console.warn('[VideoPlayer] Cross-origin playback error detected, falling back.');
                        onCorsFallbackRef.current?.();
                        return;
                    }

                    // Network/media errors are retried in place, so the error screen is not
                    // raised for them: it would stay up (covering the video) after a recovery.
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            hls?.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            hls?.recoverMediaError();
                            break;
                        default:
                            hls?.destroy();
                            setError(t('player.errorFatal'));
                            break;
                    }
                }
            });
        } else {
            if (useNativeHls) {
                console.log('[VideoPlayer] Using native HLS playback.');
            }
            video.src = src;
            video.load();

            video.addEventListener('error', () => {
                const error = video.error;
                if (looksLikeCorsMediaError(error) && isCrossOriginSrc(src) && corsFallbackFiredForSrcRef.current !== src) {
                    corsFallbackFiredForSrcRef.current = src;
                    console.warn('[VideoPlayer] Cross-origin playback error detected, falling back.');
                    onCorsFallbackRef.current?.();
                    setIsBuffering(false);
                    return;
                }
                if (isHLS && !supportsNativeHls && !Hls.isSupported()) {
                    setError(t('player.errorHlsUnsupported'));
                } else if (!isHLS && !isDirectVideo) {
                    setError(t('player.errorFormatUnsupported'));
                } else {
                    setError(t('player.errorPlayback', { message: error?.message || t('player.errorVideoLoad') }));
                }
                setIsBuffering(false);
            }, { once: true });
        }

        const updatePlayState = () => {
            setIsPlaying(!video.paused);
            // A pause from any source (media key, sync command, the button)
            // brings the controls back, as every player does.
            if (video.paused) setShowControls(true);
        };

        const updateBufferedFromVideo = () => {
            if (!video.buffered.length) return;
            const end = video.buffered.end(video.buffered.length - 1);
            const t = video.currentTime;
            const d = video.duration;
            if (Number.isFinite(d) && d > 0) {
                setBufferedPercent(Math.min(100, Math.max(0, (end / d) * 100)));
            } else {
                const ahead = Math.max(0, end - t);
                setBufferedPercent(Math.min(100, (ahead / 45) * 100));
            }
        };

        // Duration only grows within the same episode: progressive streams (MKV/MP4)
        // emit `durationchange` with smaller estimated/incorrect values mid-
        // playback. Accepting them shrank `duration - 60`, making the "next
        // episode" prompt (and the auto skip) fire mid-video. We keep the largest
        // finite value seen so far; the reset on each `src` change brings the base back to 0.
        const commitDuration = (value: number) => {
            if (Number.isNaN(value)) return;
            if (!Number.isFinite(value)) {
                setDuration(value); // live / duração desconhecida (Infinity)
                return;
            }
            setDuration(prev => (Number.isFinite(prev) && prev > value ? prev : value));
        };

        const handleTimeUpdate = () => {
            if (!isSeekingRef.current) {
                setCurrentTime(video.currentTime);
            }

            // Stable duration = the video advanced DURATION_STABLE_SEC without `duration` changing.
            const stable = Number.isFinite(video.duration)
                && video.duration > 0
                && video.currentTime - durationChangedAtTimeRef.current >= DURATION_STABLE_SEC;
            setDurationStable((prev) => (prev === stable ? prev : stable));

            confirmResume();

            const onProg = onProgressRef.current;
            if (onProg && !resumePending()) {
                onProg(video.currentTime, video.duration);
            }

            if (!Number.isFinite(video.duration) || video.duration === 0) {
                updateBufferedFromVideo();
            }
        };
        const handleLoadedMetadata = () => {
            console.log('[VideoPlayer] Metadata loaded. readyState:', video.readyState);
            commitDuration(video.duration);
            onMetadataRef.current?.(video.duration);
            setIsMetadataLoaded(true);

            if (useHlsJs) {
                // HLS: seek + play come from MANIFEST_PARSED (setupVideoHls); here only metadata.
                return;
            }

            // Native VOD / progressive: do not play on loadedmetadata (buffer near zero → waiting loop).
            cancelBufferedAutoplayWait?.();
            applyInitialSeek();
            if (isLiveHls) {
                if (autoPlay) {
                    safePlay();
                } else {
                    setIsBuffering(false);
                }
                return;
            }
            if (playbackProfile.isTvDevice) {
                if (autoPlay) {
                    safePlay();
                } else {
                    setIsBuffering(false);
                }
                return;
            }
            waitForBufferedAutoplay();
        };

        const handleEnded = () => {
            onNextRef.current?.();
        };

        const handleWaiting = () => setIsBuffering(true);
        const handleCanPlay = () => {
            console.log('[VideoPlayer] Can play. readyState:', video.readyState);
            if (!autoplayAwaitBuffer) {
                setIsBuffering(false);
            }
            setIsMetadataLoaded(true);
        };

        const handlePlaying = () => {
            setIsBuffering(false);
            setError('');
        };

        const handleProgress = () => {
            updateBufferedFromVideo();
        };

        // The player has no volume control: level is the device's job (TV
        // remote, OS mixer), so the element always plays at full volume.
        const pinFullVolume = () => {
            if (video.volume !== 1) video.volume = 1;
            if (video.muted) video.muted = false;
        };
        pinFullVolume();

        const handleVideoError = () => {
            const error = video.error;
            if (looksLikeCorsMediaError(error) && isCrossOriginSrc(src) && corsFallbackFiredForSrcRef.current !== src) {
                corsFallbackFiredForSrcRef.current = src;
                console.warn('[VideoPlayer] Cross-origin playback error detected, falling back.');
                onCorsFallbackRef.current?.();
                setIsBuffering(false);
                return;
            }
            setError(t('player.errorPlayback', { message: error?.message || t('player.errorVideoLoad') }));
            setIsBuffering(false);
        };

        // Progressive streams deliver an estimated duration on `loadedmetadata` and correct it later.
        const handleDurationChange = () => {
            commitDuration(video.duration);
        };

        video.addEventListener('play', updatePlayState);
        video.addEventListener('pause', updatePlayState);
        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('durationchange', handleDurationChange);
        video.addEventListener('canplay', handleCanPlay);
        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('progress', handleProgress);
        video.addEventListener('waiting', handleWaiting);
        video.addEventListener('playing', handlePlaying);
        video.addEventListener('ended', handleEnded);
        video.addEventListener('error', handleVideoError);
        video.addEventListener('volumechange', pinFullVolume);
        video.addEventListener('seeked', confirmResume);
        video.addEventListener('playing', confirmResume);
        video.addEventListener('canplay', confirmResume);

        if (!useHlsJs) {
            if (video.readyState >= 1) handleLoadedMetadata();
            if (video.readyState >= 3) handleCanPlay();
        }

        return () => {
            window.clearTimeout(resetPlaybackStateTimer);
            cancelBufferedAutoplayWait?.();
            playSettleTimers.forEach(timer => window.clearTimeout(timer));
            if (hls) {
                onHlsInstanceRef.current?.(null);
                hls.destroy();
            }
            video.removeEventListener('play', updatePlayState);
            video.removeEventListener('pause', updatePlayState);
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
            video.removeEventListener('durationchange', handleDurationChange);
            video.removeEventListener('canplay', handleCanPlay);
            video.removeEventListener('timeupdate', handleTimeUpdate);
            video.removeEventListener('progress', handleProgress);
            video.removeEventListener('waiting', handleWaiting);
            video.removeEventListener('playing', handlePlaying);
            video.removeEventListener('ended', handleEnded);
            video.removeEventListener('error', handleVideoError);
            video.removeEventListener('volumechange', pinFullVolume);
            video.removeEventListener('seeked', confirmResume);
            video.removeEventListener('playing', confirmResume);
            video.removeEventListener('canplay', confirmResume);
        };
        // `initialTime` enters only as the snapshot taken when `src` changes.
    }, [src, autoPlay, t]);

    // 0..1 — NextEpisodePrompt turns this into a CSS width percentage itself.
    const autoSkipProgress = (NEXT_EPISODE_AUTO_SKIP_SEC - autoSkipSecondsLeft) / NEXT_EPISODE_AUTO_SKIP_SEC;

    const containerStyle: CSSProperties & Record<'--subtitle-font-size', string> = {
        '--subtitle-font-size': `${subtitleFontSize}rem`,
    };

    const subtitlesAvailable = Boolean(subtitleUrl);

    const seekBarProps: SeekBarProps = {
        currentTime: displayTime,
        duration: displayDuration,
        bufferedPercent,
        disabled: isLive,
        onSeek: handleSeek,
        onSeekStart: () => {
            cancelScrub();
            setIsSeeking(true);
        },
        onSeekEnd: () => setIsSeeking(false),
        scrub,
        inputRef: seekInputRef,
    };


    return (
        <div
            ref={containerRef}
            // D7: explicit sizing instead of a proportion-locking utility
            // class (needs Chrome 88); the player always fills the viewport,
            // so a fixed height is exact.
            className="relative w-full h-[100vh] max-h-[100vh] bg-black overflow-hidden"
            style={containerStyle}
            // The player expects nothing focused (OK toggles play, arrows seek);
            // keeps useAutoFocusMainContent from parking focus on the top bar's Back.
            data-no-autofocus="true"
            onMouseMove={handleInteraction}
            onMouseLeave={() => isPlaying && hideControls()}
            onTouchStart={handleInteraction}
            // A D-pad focus move (useTvNavigation) fires a native `focus` event
            // that bubbles here — without this, the auto-hidden control bar
            // stays invisible while the D-pad cursor keeps moving/activating
            // its (invisible) buttons.
            onFocusCapture={handleInteraction}
        >
            <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-contain cursor-pointer"
                poster={poster}
                playsInline
                preload={preloadMode}
                // crossOrigin="anonymous" // NEVER use this
                onClick={togglePlay}
                onDoubleClick={toggleFullscreen}
                onTouchStart={(e) => {
                    e.stopPropagation();
                    handleInteraction();
                }}
            >
                {subtitleUrl && subtitlesEnabled && (
                    <track
                        key={subtitleUrl}
                        kind="subtitles"
                        src={subtitleUrl}
                        srcLang="pt-BR"
                        label={t('player.subtitleTrackLabel')}
                        default
                    />
                )}
            </video>

            <PlayerOverlays
                isBuffering={isBuffering}
                showBufferingHelp={showBufferingHelp}
                centerPlayPause={centerPlayPause}
                skipIndicator={skipIndicator}
                error={error}
            />

            {overlaySlot}

            <StartOverPrompt
                resumedFrom={showStartOver ? startOver.from : null}
                onStartOver={handleStartOver}
                promptRef={startOverPromptRef}
                buttonRef={startOverButtonRef}
            />

            {/* Próximo episódio — último minuto, com pulo automático em 10s */}
            <NextEpisodePrompt
                visible={showNextEpisodePrompt}
                autoSkipProgress={autoSkipProgress}
                secondsLeft={autoSkipSecondsLeft}
                onNext={onNext}
                onPostpone={handlePostponeNextEpisode}
                promptRef={nextEpisodePromptRef}
                nextButtonRef={nextEpisodeButtonRef}
                postponeButtonRef={postponeButtonRef}
            />

            {/* Controls Overlay */}
            <div
                ref={controlsOverlayRef}
                className={`absolute inset-0 z-10 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onMouseEnter={() => setShowControls(true)}
                onClick={(e) => {
                    if (e.target === e.currentTarget) {
                        togglePlay();
                    }
                }}
            >
                {/* Top Bar with Back Button */}
                {(onBack || topRightSlot || title) && (
                    <PlayerTopBar
                        title={title}
                        subtitle={subtitle}
                        onBack={onBack}
                        rightSlot={topRightSlot}
                        visible={showControls}
                    />
                )}

                {/* Bottom Controls */}
                <PlayerControls
                    isPlaying={isPlaying}
                    onTogglePlay={togglePlay}
                    onPrevious={onPrevious}
                    onNext={onNext}
                    hasPrevious={hasPrevious}
                    hasNext={hasNext}
                    isLive={isLive}
                    onChannelStep={isLive ? onChannelStep : undefined}
                    currentTime={displayTime}
                    duration={displayDuration}
                    subtitlesAvailable={subtitlesAvailable}
                    subtitlesEnabled={subtitlesEnabled}
                    onToggleSubtitles={toggleSubtitles}
                    subtitleFontSize={subtitleFontSize}
                    onChangeFontSize={changeFontSize}
                    isFullscreen={isFullscreen}
                    onToggleFullscreen={toggleFullscreen}
                    seek={seekBarProps}
                />
            </div>
        </div>
    );
}
