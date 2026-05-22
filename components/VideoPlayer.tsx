'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { Maximize, Minimize, Play, Pause, Volume2, VolumeX, AlertTriangle, ArrowLeft, Loader2, Subtitles } from 'lucide-react';
import { useNavigationOverride } from '@/app/context/NavigationContext';
import { getDeviceProfile } from '@/app/lib/deviceProfile';

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
    enterFullscreen?: boolean;
    onBack?: () => void;
    subtitleUrl?: string;
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
    enterFullscreen = false,
    onBack,
    subtitleUrl
}: VideoPlayerProps) {
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
    const [isSeeking, setIsSeeking] = useState(false);
    const [isBuffering, setIsBuffering] = useState(false);
    const [bufferedPercent, setBufferedPercent] = useState(0);
    const [skipIndicator, setSkipIndicator] = useState<{ show: boolean; text: string }>({ show: false, text: '' });
    const [showVolumeSlider, setShowVolumeSlider] = useState(false);
    const [centerPlayPause, setCenterPlayPause] = useState<{ show: boolean; playing: boolean }>({ show: false, playing: false });
    const [subtitleFontSize, setSubtitleFontSize] = useState(1.5);
    const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
    const [isMetadataLoaded, setIsMetadataLoaded] = useState(false);
    const [preloadMode, setPreloadMode] = useState<VideoPreloadMode>('metadata');

    // Auto-enable subtitles when a new URL is provided
    useEffect(() => {
        if (subtitleUrl) {
            console.log('[VideoPlayer] received subtitleUrl:', subtitleUrl);
            setSubtitlesEnabled(true);
        }
    }, [subtitleUrl]);

    const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const skipIndicatorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const centerIconTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Load saved font size
    useEffect(() => {
        const savedSize = localStorage.getItem('xstream_subtitle_fontsize');
        if (savedSize) {
            setSubtitleFontSize(parseFloat(savedSize));
        }
    }, []);

    useEffect(() => {
        setPreloadMode(getPlaybackProfile().preload);
    }, []);

    const saveFontSize = (size: number) => {
        setSubtitleFontSize(size);
        localStorage.setItem('xstream_subtitle_fontsize', String(size));
    };

    const changeFontSize = (delta: number) => {
        const newSize = Math.max(0.8, Math.min(2.5, subtitleFontSize + delta));
        saveFontSize(newSize);
    };

    // Register custom back handler via navigation context
    useNavigationOverride(onBack ? () => {
        console.log('VideoPlayer::Custom back handler triggered');
        onBack();
    } : null);

    // Cross-platform fullscreen helpers
    // Unified Fullscreen Helpers
    const getFullscreenElement = useCallback((): Element | null => {
        return document.fullscreenElement
            || (document as any).webkitFullscreenElement
            || null;
    }, []);

    const isCurrentlyFullscreen = useCallback(() => {
        const video = videoRef.current;
        return !!getFullscreenElement() || (video as any)?.webkitDisplayingFullscreen === true;
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
            // Priority 1: iOS Safari / Mobile Webkit on Video Element
            // Direct call is required synchronously during user gesture.
            if ((video as any).webkitEnterFullscreen) {
                (video as any).webkitEnterFullscreen();
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
            else if ((container as any).webkitRequestFullscreen) {
                (container as any).webkitRequestFullscreen();
            }
        } catch (e) {
            if (!isProgrammatic) console.error('[VideoPlayer] Fullscreen attempt failed:', e);
        }
    }, [isMetadataLoaded]);

    const exitFullscreenMode = useCallback(() => {
        try {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if ((document as any).webkitExitFullscreen) {
                (document as any).webkitExitFullscreen();
            } else if (videoRef.current && (videoRef.current as any).webkitExitFullscreen) {
                (videoRef.current as any).webkitExitFullscreen();
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

    // Automatic Fullscreen Trigger
    useEffect(() => {
        if (enterFullscreen && containerRef.current && isMetadataLoaded && !isCurrentlyFullscreen()) {
            console.log('[VideoPlayer] Handling enterFullscreen prop - Programmatic attempt');
            // Programmatic calls often fail on iOS, so we pass true to fail silently
            enterFullscreenMode(true);
        }
    }, [enterFullscreen, isMetadataLoaded, isCurrentlyFullscreen, enterFullscreenMode]);

    const formatTime = (time: number) => {
        if (isNaN(time)) return '00:00';
        const h = Math.floor(time / 3600);
        const m = Math.floor((time % 3600) / 60);
        const s = Math.floor(time % 60);
        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const hasAppliedInitialTime = useRef(false);
    /** Snapshot de `initialTime` no momento em que `src` muda — evita recriar HLS quando o checkpoint atualiza. */
    const initialSeekForActiveSrcRef = useRef(0);
    const onProgressRef = useRef(onProgress);
    const onMetadataRef = useRef(onMetadata);
    const onNextRef = useRef(onNext);
    const isSeekingRef = useRef(isSeeking);
    isSeekingRef.current = isSeeking;

    useEffect(() => {
        onProgressRef.current = onProgress;
        onMetadataRef.current = onMetadata;
        onNextRef.current = onNext;
    }, [onProgress, onMetadata, onNext]);

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



    const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(e.target.value);
        setCurrentTime(time);
        if (videoRef.current) {
            videoRef.current.currentTime = time;
        }
    }, []);

    const skip = useCallback((seconds: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime += seconds;
            showSkipFeedback(seconds);
        }
    }, [showSkipFeedback]);

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

    const jumpToPercent = useCallback((percent: number) => {
        if (videoRef.current && duration > 0) {
            const targetTime = (percent / 100) * duration;
            videoRef.current.currentTime = targetTime;
        }
    }, [duration]);

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

            switch (e.key.toLowerCase()) {
                case ' ':
                    e.preventDefault();
                    togglePlay();
                    break;
                case 'arrowleft':
                    e.preventDefault();
                    skip(e.ctrlKey || e.metaKey ? -10 : -5);
                    break;
                case 'arrowright':
                    e.preventDefault();
                    skip(e.ctrlKey || e.metaKey ? 10 : 5);
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
                    if (subtitleUrl) {
                        setSubtitlesEnabled(prev => !prev);
                    }
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
    }, [togglePlay, skip, adjustVolume, toggleFullscreen, toggleMute, jumpToPercent]);

    // Video setup and HLS — deps só [src, autoPlay]: initialTime entra só como snapshot (seekTarget) ao trocar fonte; callbacks via refs (evita loop de checkpoint).
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const seekTarget = initialTime > 0 ? initialTime : 0;
        initialSeekForActiveSrcRef.current = seekTarget;

        setError('');
        setCurrentTime(0);
        setDuration(0);
        setIsBuffering(true);
        setIsMetadataLoaded(false);
        hasAppliedInitialTime.current = false;

        const playbackProfile = getPlaybackProfile();
        video.preload = playbackProfile.preload;

        const isHLS = src.toLowerCase().includes('.m3u8');
        const isDirectVideo = /\.(mp4|mkv|avi|webm|mov)$/i.test(src.split('?')[0]);
        const isLiveHls = isHLS && /\/live\//i.test(src);
        const supportsNativeHls = isHLS && video.canPlayType('application/vnd.apple.mpegurl') !== '';
        const useNativeHls = isHLS && supportsNativeHls;
        const useHlsJs = isHLS && !useNativeHls && Hls.isSupported();

        let hls: Hls | undefined;
        /** Cancela espera por buffer antes do autoplay (progress/canplay + timeout). */
        let cancelBufferedAutoplayWait: (() => void) | undefined;
        /** Enquanto true, `canplay` não zera o spinner (autoplay aguardando buffer mínimo). */
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
            if (seekTarget > 0 && !hasAppliedInitialTime.current) {
                console.log('[VideoPlayer] Seeking to initial time:', seekTarget);
                video.currentTime = seekTarget;
                hasAppliedInitialTime.current = true;
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
                    video.play().catch(e => console.warn('[VideoPlayer] Play failed:', e));
                }
            };

            const timeoutId = window.setTimeout(() => {
                cancelBufferedAutoplayWait?.();
                video.play().catch(e => console.warn('[VideoPlayer] Play failed:', e));
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
            } else if (isLiveHls) {
                video.play().catch(e => console.warn('[VideoPlayer] Play failed:', e));
            } else {
                waitForBufferedAutoplay();
            }
        };

        if (useHlsJs) {
            console.log('[VideoPlayer] Initializing HLS.js for:', src, playbackProfile);
            // Ajusta CPU/RAM/buffer para TVs e conexões lentas.
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
                ...(isLiveHls
                    ? {
                          liveDurationInfinity: true,
                          liveSyncDurationCount: 5,
                          liveMaxLatencyDurationCount: 14,
                          initialLiveManifestSize: 2,
                      }
                    : {}),
            });

            hls.loadSource(src);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                console.log('[VideoPlayer] HLS Manifest parsed.');
                setupVideoHls();
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
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

        const handleTimeUpdate = () => {
            if (!isSeekingRef.current) {
                setCurrentTime(video.currentTime);
            }

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
            setDuration(video.duration);
            onMetadataRef.current?.(video.duration);
            setIsMetadataLoaded(true);

            if (useHlsJs) {
                // HLS: seek + play vêm do MANIFEST_PARSED (setupVideoHls); aqui só metadata.
                return;
            }

            // VOD / progressive nativo: não dar play em loadedmetadata (buffer quase zero → waiting em loop).
            cancelBufferedAutoplayWait?.();
            applyInitialSeek();
            if (isLiveHls) {
                if (autoPlay) {
                    video.play().catch(e => console.warn('[VideoPlayer] Play failed:', e));
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

        video.addEventListener('play', updatePlayState);
        video.addEventListener('pause', updatePlayState);
        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('canplay', handleCanPlay);
        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('progress', handleProgress);
        video.addEventListener('waiting', handleWaiting);
        video.addEventListener('playing', handlePlaying);
        video.addEventListener('ended', handleEnded);
        video.addEventListener('error', handleVideoError);
        video.addEventListener('volumechange', handleVolumeChange);

        return () => {
            cancelBufferedAutoplayWait?.();
            if (hls) hls.destroy();
            video.removeEventListener('play', updatePlayState);
            video.removeEventListener('pause', updatePlayState);
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
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

    const isLive = duration === Infinity || duration === 0;
    const volumePercent = Math.round(volume * 100);

    return (
        <div
            ref={containerRef}
            className="relative w-full max-h-[100vh] aspect-video bg-black group overflow-hidden rounded-xl shadow-2xl border border-white/10"
            style={{ '--subtitle-font-size': `${subtitleFontSize}rem` } as any}
            onMouseMove={handleInteraction}
            onMouseLeave={() => isPlaying && setShowControls(false)}

            onTouchStart={handleInteraction}
        >
            <video
                ref={videoRef}
                className="w-full h-full object-contain cursor-pointer"
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

            {/* Buffering Indicator */}
            {isBuffering && (
                <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
                    <div className="bg-black/60  rounded-full p-6 shadow-2xl">
                        <Loader2 className="w-12 h-12 text-red-500 animate-spin" />
                    </div>
                </div>
            )}

            {/* Center Play/Pause Indicator */}
            {centerPlayPause.show && (
                <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                    <div className="bg-black/70  rounded-full p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
                        {centerPlayPause.playing ? (
                            <Play size={64} fill="white" className="text-white" />
                        ) : (
                            <Pause size={64} fill="white" className="text-white" />
                        )}
                    </div>
                </div>
            )}

            {/* Skip Indicator */}
            {skipIndicator.show && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
                    <div className="bg-black/80  rounded-2xl px-8 py-4 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <p className="text-white text-3xl font-bold">{skipIndicator.text}</p>
                    </div>
                </div>
            )}

            {/* Error Overlay */}
            {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/90 backdrop- z-30">
                    <div className="text-center text-red-400 max-w-md mx-auto px-6">
                        <AlertTriangle size={64} className="mx-auto mb-4 drop-shadow-lg" />
                        <p className="text-lg font-medium">{error}</p>
                    </div>
                </div>
            )}

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
                {onBack && (
                    <div className="absolute top-0 left-0 w-full p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
                        <button
                            onClick={onBack}
                            className="bg-black/60  hover:bg-white/20 p-2 rounded-full text-white transition-all transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-red-500 shadow-xl"
                            title="Voltar"
                            aria-label="Voltar"
                        >
                            <ArrowLeft size={24} />
                        </button>
                    </div>
                )}

                {/* Bottom Controls */}
                <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/95 via-black/80 to-transparent px-4 py-2 backdrop-">
                    {/* Barra de fundo + buffer (sempre); posição/seek só em VOD */}
                    <div className="mb-1 group/progress">
                        <div className="relative h-1 flex items-center">
                            <div className="absolute inset-0 bg-white/5 rounded-full" />

                            <div
                                className="absolute inset-y-0 left-0 bg-white/25 rounded-full transition-all duration-300"
                                style={{ width: `${Number.isFinite(bufferedPercent) ? bufferedPercent : 0}%` }}
                                aria-hidden
                            />

                            {!isLive && (
                                <>
                                    <div
                                        className="absolute inset-y-0 left-0 bg-red-500 rounded-full pointer-events-none z-[1]"
                                        style={{
                                            width: `${duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0}%`
                                        }}
                                    />

                                    <input
                                        type="range"
                                        min={0}
                                        max={duration || 0}
                                        value={currentTime}
                                        onChange={handleSeek}
                                        onMouseDown={() => setIsSeeking(true)}
                                        onMouseUp={() => setIsSeeking(false)}
                                        className="absolute inset-0 w-full bg-transparent appearance-none cursor-pointer z-10
                                        [&::-webkit-slider-runnable-track]:bg-transparent
                                        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                                        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-red-500 
                                        [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(239,68,68,0.5)] [&::-webkit-slider-thumb]:cursor-pointer
                                        [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125
                                        [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white
                                        [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 
                                        [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-red-500 
                                        [&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:cursor-pointer
                                        [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white"
                                        aria-label="Progresso do vídeo"
                                    />
                                </>
                            )}
                        </div>
                    </div>

                    {/* Control Buttons */}
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            {/* Previous Episode */}
                            {onPrevious && (hasPrevious || true) && (
                                <button
                                    onClick={onPrevious}
                                    disabled={!hasPrevious}
                                    className={`text-white transition-all focus:outline-none focus:ring-2 focus:ring-white/50 rounded-lg p-2 ${!hasPrevious ? 'opacity-30 cursor-not-allowed' : 'hover:text-red-400 hover:scale-110'}`}
                                    title="Episódio Anterior"
                                    aria-label="Episódio Anterior"
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                                        <polygon points="19 20 9 12 19 4 19 20"></polygon>
                                        <line x1="5" y1="19" x2="5" y2="5"></line>
                                    </svg>
                                </button>
                            )}

                            {/* Skip Backward */}
                            <button
                                onClick={() => skip(-10)}
                                className="text-white hover:text-red-400 hover:scale-110 transition-all focus:outline-none focus:ring-2 focus:ring-white/50 rounded-lg p-2"
                                title="Voltar 10s"
                                aria-label="Voltar 10 segundos"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                                    <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
                                </svg>
                            </button>

                            {/* Play/Pause */}
                            <button
                                onClick={togglePlay}
                                data-focusable="true"
                                tabIndex={0}
                                className="text-white hover:text-red-400 hover:scale-110 transition-all focus:outline-none focus:ring-2 focus:ring-white/50 rounded-full p-2 bg-white/10 backdrop-"
                                aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
                            >
                                {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
                            </button>

                            {/* Skip Forward */}
                            <button
                                onClick={() => skip(10)}
                                className="text-white hover:text-red-400 hover:scale-110 transition-all focus:outline-none focus:ring-2 focus:ring-white/50 rounded-lg p-2"
                                title="Avançar 10s"
                                aria-label="Avançar 10 segundos"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                                    <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />
                                </svg>
                            </button>

                            {/* Time Display integrated here */}
                            {!isLive && (
                                <div className="flex items-center gap-1.5 px-2 text-[11px] font-medium text-gray-400 whitespace-nowrap tabular-nums">
                                    <span className="text-white">{formatTime(currentTime)}</span>
                                    <span className="opacity-40">/</span>
                                    <span>{formatTime(duration)}</span>
                                </div>
                            )}

                            {/* Next Episode */}
                            {onNext && (hasNext || true) && (
                                <button
                                    onClick={onNext}
                                    disabled={!hasNext}
                                    className={`text-white transition-all focus:outline-none focus:ring-2 focus:ring-white/50 rounded-lg p-2 ${!hasNext ? 'opacity-30 cursor-not-allowed' : 'hover:text-red-400 hover:scale-110'}`}
                                    title="Próximo Episódio"
                                    aria-label="Próximo Episódio"
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                                        <polygon points="5 4 15 12 5 20 5 4"></polygon>
                                        <line x1="19" y1="5" x2="19" y2="19"></line>
                                    </svg>
                                </button>
                            )}

                            {/* Volume Control */}
                            <div
                                className="relative ml-2"
                                onMouseEnter={() => setShowVolumeSlider(true)}
                                onMouseLeave={() => setShowVolumeSlider(false)}
                            >
                                <button
                                    onClick={toggleMute}
                                    data-focusable="true"
                                    tabIndex={0}
                                    className="text-white hover:text-red-400 hover:scale-110 transition-all focus:outline-none focus:ring-2 focus:ring-white/50 rounded-lg p-2"
                                    aria-label={isMuted ? 'Ativar som' : 'Silenciar'}
                                >
                                    {isMuted || volume === 0 ? <VolumeX size={24} /> : <Volume2 size={24} />}
                                </button>

                                {/* Volume Slider */}
                                {showVolumeSlider && (
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-black/80  rounded-xl p-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
                                        <div className="flex flex-col items-center gap-2">
                                            <span className="text-white text-xs font-medium">{volumePercent}%</span>
                                            <input
                                                type="range"
                                                min="0"
                                                max="1"
                                                step="0.01"
                                                value={volume}
                                                onChange={(e) => {
                                                    const newVolume = parseFloat(e.target.value);
                                                    if (videoRef.current) {
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
                                                }}
                                                className="h-24 w-2 appearance-none bg-white/20 rounded-full cursor-pointer
                                                    [writing-mode:bt-lr] [-webkit-appearance:slider-vertical]
                                                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                                                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-red-500 
                                                    [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-pointer
                                                    [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white
                                                    [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 
                                                    [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-red-500 
                                                    [&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:cursor-pointer
                                                    [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white"
                                                aria-label="Controle de volume"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Live Indicator */}
                            {isLive && (
                                <div className="flex items-center gap-2 ml-2">
                                    <span className="relative flex h-3 w-3">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                    </span>
                                    <span className="text-white text-sm font-semibold uppercase tracking-wide">Ao Vivo</span>
                                </div>
                            )}
                        </div>

                        {/* Right Controls */}
                        <div className="flex items-center gap-3">
                            {/* Subtitle Font Size Controls */}
                            {subtitleUrl && subtitlesEnabled && (
                                <div className="flex items-center gap-1 bg-white/5 rounded-lg px-2 py-1">
                                    <button
                                        onClick={() => changeFontSize(-0.1)}
                                        className="text-white/60 hover:text-white p-1 transition-colors"
                                        title="Diminuir fonte ( [ )"
                                    >
                                        <span className="text-xs font-bold">A-</span>
                                    </button>
                                    <div className="w-[1px] h-3 bg-white/10 mx-1"></div>
                                    <button
                                        onClick={() => changeFontSize(0.1)}
                                        className="text-white/60 hover:text-white p-1 transition-colors"
                                        title="Aumentar fonte ( ] )"
                                    >
                                        <span className="text-sm font-bold">A+</span>
                                    </button>
                                </div>
                            )}

                            {/* Subtitle Toggle */}
                            {subtitleUrl && (
                                <button
                                    onClick={() => setSubtitlesEnabled(prev => !prev)}
                                    data-focusable="true"
                                    tabIndex={0}
                                    className={`transition-all focus:outline-none focus:ring-2 focus:ring-white/50 rounded-lg p-2 ${subtitlesEnabled ? 'text-emerald-400 hover:text-emerald-300' : 'text-white/40 hover:text-white/70'} hover:scale-110`}
                                    aria-label={subtitlesEnabled ? 'Desativar legendas' : 'Ativar legendas'}
                                    title={subtitlesEnabled ? 'Desativar legendas (C)' : 'Ativar legendas (C)'}
                                >
                                    <Subtitles size={24} />
                                </button>
                            )}

                            {/* Fullscreen Button */}
                            <button
                                onClick={toggleFullscreen}
                                data-focusable="true"
                                tabIndex={0}
                                className="text-white hover:text-red-400 hover:scale-110 transition-all focus:outline-none focus:ring-2 focus:ring-white/50 rounded-lg p-2"
                                aria-label={isFullscreen ? 'Sair do modo tela cheia' : 'Modo tela cheia'}
                            >
                                {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
