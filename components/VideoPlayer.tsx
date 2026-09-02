'use client';

import { useEffect, useRef, useState, useCallback, type CSSProperties } from 'react';
import Hls from 'hls.js';
import { useNavigationOverride } from '@/app/context/NavigationContext';
import { useProfile } from '@/app/context/ProfileContext';
import { getDeviceProfile } from '@/app/lib/deviceProfile';
import { getDeviceToken, getServerBaseUrl } from '@/app/lib/apiClient';
import PlayerTopBar from '@/components/player/PlayerTopBar';
import PlayerControls from '@/components/player/PlayerControls';
import PlayerOverlays from '@/components/player/PlayerOverlays';
import NextEpisodePrompt from '@/components/player/NextEpisodePrompt';
import type { SeekBarProps } from '@/components/player/SeekBar';
import type { VolumeControlProps } from '@/components/player/VolumeControl';

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
    onSeekBeyondWindow
}: VideoPlayerProps) {
    const { activeProfile, updatePrefs } = useProfile();
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(1);
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

    const hasAppliedInitialTime = useRef(false);
    /** Snapshot of `initialTime` at the moment `src` changes — avoids recreating HLS when the checkpoint updates. */
    const initialSeekForActiveSrcRef = useRef(0);
    const onProgressRef = useRef(onProgress);
    const onMetadataRef = useRef(onMetadata);
    const onNextRef = useRef(onNext);
    const isSeekingRef = useRef(isSeeking);

    useEffect(() => {
        onProgressRef.current = onProgress;
        onMetadataRef.current = onMetadata;
        onNextRef.current = onNext;
    }, [onProgress, onMetadata, onNext]);

    useEffect(() => {
        isSeekingRef.current = isSeeking;
    }, [isSeeking]);

    // Hands the <video> element to the parent (player sync) — stable across the lifecycle.
    const onVideoElementRef = useRef(onVideoElement);
    useEffect(() => { onVideoElementRef.current = onVideoElement; }, [onVideoElement]);
    const onHlsInstanceRef = useRef(onHlsInstance);
    useEffect(() => { onHlsInstanceRef.current = onHlsInstance; }, [onHlsInstance]);
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

    useEffect(() => {
        if (showNextEpisodePrompt) {
            nextEpisodeButtonRef.current?.focus();
        }
    }, [showNextEpisodePrompt]);

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

    const toggleMute = useCallback(() => {
        if (videoRef.current) {
            videoRef.current.muted = !videoRef.current.muted;
            setIsMuted(videoRef.current.muted);
        }
    }, []);



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
        if (isBroadcastTimeline) {
            seekToAbsolute(time);
            return;
        }
        setCurrentTime(time);
        if (videoRef.current) {
            videoRef.current.currentTime = time;
        }
    }, [isBroadcastTimeline, seekToAbsolute]);

    const skip = useCallback((seconds: number) => {
        if (!videoRef.current) return;
        if (isBroadcastTimeline) {
            seekToAbsolute(timeOffset + videoRef.current.currentTime + seconds);
        } else {
            videoRef.current.currentTime += seconds;
        }
        showSkipFeedback(seconds);
    }, [showSkipFeedback, isBroadcastTimeline, seekToAbsolute, timeOffset]);

    const adjustVolume = useCallback((delta: number) => {
        if (videoRef.current) {
            const newVolume = Math.max(0, Math.min(1, videoRef.current.volume + delta));
            videoRef.current.volume = newVolume;
            setVolume(newVolume);
            if (newVolume === 0) {
                setIsMuted(true);
                videoRef.current.muted = true;
            } else if (isMuted) {
                setIsMuted(false);
                videoRef.current.muted = false;
            }
        }
    }, [isMuted]);

    /**
     * Slider-driven volume change (VolumeControl). Kept beside `adjustVolume`
     * so the mute/unmute decision on 0/non-zero volume lives in one place
     * instead of being duplicated in the presentation layer (spec 05 §4).
     */
    const handleVolumeChange = useCallback((next: number) => {
        if (!videoRef.current) return;
        videoRef.current.volume = next;
        setVolume(next);
        if (next === 0) {
            setIsMuted(true);
            videoRef.current.muted = true;
        } else if (isMuted) {
            setIsMuted(false);
            videoRef.current.muted = false;
        }
    }, [isMuted]);

    const jumpToPercent = useCallback((percent: number) => {
        if (isBroadcastTimeline) {
            seekToAbsolute((percent / 100) * totalDuration);
            return;
        }
        if (videoRef.current && duration > 0) {
            const targetTime = (percent / 100) * duration;
            videoRef.current.currentTime = targetTime;
        }
    }, [duration, isBroadcastTimeline, seekToAbsolute, totalDuration]);

    const handleInteraction = useCallback(() => {
        setShowControls(true);

        if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
        }

        controlsTimeoutRef.current = setTimeout(() => {
            if (isPlaying) setShowControls(false);
        }, 3000);
    }, [isPlaying]);

    // Keyboard controls
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            const key = e.key.toLowerCase();

            // While focus sits inside the control bar, arrow keys must propagate
            // untouched so useTvNavigation can move the D-pad cursor between its
            // buttons — otherwise the buttons stay focusable but unreachable
            // (spec 05 §3, corrects D6). The next-episode prompt has its own
            // handler above (moveNextEpisodePromptFocus) and runs first, since
            // its buttons live outside [data-player-controls].
            if (key === 'arrowleft' || key === 'arrowright' || key === 'arrowup' || key === 'arrowdown') {
                const activeElement = document.activeElement;
                if (activeElement instanceof Element && activeElement.closest('[data-player-controls]')) {
                    return;
                }
                // Up/Down inside the next-episode prompt must escape to the D-pad
                // navigator instead of adjusting volume — the prompt only
                // intercepts Left/Right itself (moveNextEpisodePromptFocus, below).
                if (
                    (key === 'arrowup' || key === 'arrowdown') &&
                    activeElement instanceof Node &&
                    nextEpisodePromptRef.current?.contains(activeElement)
                ) {
                    return;
                }
            }

            switch (key) {
                case ' ':
                    e.preventDefault();
                    togglePlay();
                    break;
                case 'arrowleft':
                    e.preventDefault();
                    if (!moveNextEpisodePromptFocus('left')) {
                        skip(e.ctrlKey || e.metaKey ? -10 : -5);
                    }
                    break;
                case 'arrowright':
                    e.preventDefault();
                    if (!moveNextEpisodePromptFocus('right')) {
                        skip(e.ctrlKey || e.metaKey ? 10 : 5);
                    }
                    break;
                case 'arrowup':
                    e.preventDefault();
                    adjustVolume(0.05);
                    break;
                case 'arrowdown':
                    e.preventDefault();
                    adjustVolume(-0.05);
                    break;
                case 'f':
                    e.preventDefault();
                    toggleFullscreen();
                    break;
                case 'm':
                    e.preventDefault();
                    toggleMute();
                    break;
                case 'c':
                    e.preventDefault();
                    toggleSubtitles();
                    break;
                case ']':
                    e.preventDefault();
                    changeFontSize(0.1);
                    break;
                case '[':
                    e.preventDefault();
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
                    e.preventDefault();
                    jumpToPercent(parseInt(e.key) * 10);
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [togglePlay, skip, adjustVolume, toggleFullscreen, toggleMute, jumpToPercent, changeFontSize, toggleSubtitles, moveNextEpisodePromptFocus]);

    // Video setup and HLS — deps only [src, autoPlay]: initialTime enters only as a snapshot (seekTarget) on source change; callbacks via refs (avoids checkpoint loop).
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const seekTarget = initialTime > 0 ? initialTime : 0;
        initialSeekForActiveSrcRef.current = seekTarget;

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

        const applyInitialSeek = () => {
            if (seekTarget > 0 && !hasAppliedInitialTime.current && video.readyState >= 1) {
                console.log('[VideoPlayer] Seeking to initial time:', seekTarget);
                video.currentTime = seekTarget;
                hasAppliedInitialTime.current = true;
            }
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
                    setError(`Stream error: ${data.details}. Retrying...`);
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            hls?.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            hls?.recoverMediaError();
                            break;
                        default:
                            hls?.destroy();
                            setError('Fatal playback error.');
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
                if (isHLS && !supportsNativeHls && !Hls.isSupported()) {
                    setError('Your browser does not support HLS playback.');
                } else if (!isHLS && !isDirectVideo) {
                    setError('Unsupported video format.');
                } else {
                    setError(`Playback Error: ${error?.message || 'The video could not be loaded.'}`);
                }
                setIsBuffering(false);
            }, { once: true });
        }

        const updatePlayState = () => setIsPlaying(!video.paused);

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

            const isAtStart = video.currentTime === 0;
            const waitingForSeek = seekTarget > 0 && !hasAppliedInitialTime.current;

            const onProg = onProgressRef.current;
            if (onProg && (!isAtStart || !waitingForSeek)) {
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

        const handlePlaying = () => setIsBuffering(false);

        const handleProgress = () => {
            updateBufferedFromVideo();
        };

        const handleVolumeChange = () => {
            setVolume(video.volume);
            setIsMuted(video.muted);
        };

        const handleVideoError = () => {
            const error = video.error;
            setError(`Playback Error: ${error?.message || 'The video could not be loaded.'}`);
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
        video.addEventListener('volumechange', handleVolumeChange);

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
            video.removeEventListener('volumechange', handleVolumeChange);
        };
    }, [src, autoPlay]);

    useEffect(() => {
        const video = videoRef.current;
        const target = initialSeekForActiveSrcRef.current;
        if (!video || !target || hasAppliedInitialTime.current || !isMetadataLoaded) return;

        const applySeek = () => {
            if (target > 0 && !hasAppliedInitialTime.current && video.currentTime < 5) {
                console.log('[VideoPlayer] Applying initialTime late:', target);
                video.currentTime = target;
                hasAppliedInitialTime.current = true;
            }
        };

        if (video.readyState >= 1) {
            applySeek();
        } else {
            const onLateMetadata = () => {
                applySeek();
                video.removeEventListener('loadedmetadata', onLateMetadata);
            };
            video.addEventListener('loadedmetadata', onLateMetadata);
            return () => video.removeEventListener('loadedmetadata', onLateMetadata);
        }
    }, [src, isMetadataLoaded]);

    // In Modo TV the stream's own duration is just the sliding window (a few seconds,
    // and growing) — the title's real timeline comes from the offset + known duration.
    const isLive = isBroadcastTimeline ? false : (duration === Infinity || duration === 0);
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
        onSeekStart: () => setIsSeeking(true),
        onSeekEnd: () => setIsSeeking(false),
    };

    const volumeControlProps: VolumeControlProps = {
        volume,
        muted: isMuted,
        onToggleMute: toggleMute,
        onVolumeChange: handleVolumeChange,
    };

    return (
        <div
            ref={containerRef}
            // D7: explicit sizing instead of a proportion-locking utility
            // class (needs Chrome 88); the player always fills the viewport,
            // so a fixed height is exact.
            className="relative w-full h-[100vh] max-h-[100vh] bg-black overflow-hidden"
            style={containerStyle}
            onMouseMove={handleInteraction}
            onMouseLeave={() => isPlaying && setShowControls(false)}
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
                        label="Português (BR)"
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
                    onSkip={skip}
                    onPrevious={onPrevious}
                    onNext={onNext}
                    hasPrevious={hasPrevious}
                    hasNext={hasNext}
                    isLive={isLive}
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
                    volume={volumeControlProps}
                />
            </div>
        </div>
    );
}
