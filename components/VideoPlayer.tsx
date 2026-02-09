'use client';

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Maximize, Minimize, Play, Pause, Volume2, VolumeX, AlertTriangle, ArrowLeft } from 'lucide-react';
import { useNavigationOverride } from '@/app/context/NavigationContext';

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
    onBack
}: VideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [error, setError] = useState('');
    const [showControls, setShowControls] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isSeeking, setIsSeeking] = useState(false);

    // Register custom back handler via navigation context
    // This ensures only one handler executes when back is pressed
    useNavigationOverride(onBack ? () => {
        console.log('VideoPlayer::Custom back handler triggered');
        // Exit fullscreen first if in fullscreen
        if (document.fullscreenElement) {
            document.exitFullscreen().then(() => {
                onBack();
            }).catch(() => {
                onBack();
            });
        } else {
            onBack();
        }
    } : null);

    useEffect(() => {
        if (enterFullscreen && containerRef.current && !document.fullscreenElement) {
            containerRef.current.requestFullscreen().catch(err => {
                console.warn('[VideoPlayer] Auto-fullscreen failed:', err);
            });
        }
    }, [enterFullscreen]);

    let controlsTimeout: NodeJS.Timeout;

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

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        // Reset error on src change
        setError('');
        setCurrentTime(0);
        setDuration(0);
        hasAppliedInitialTime.current = false;

        const isHLS = src.toLowerCase().includes('.m3u8');
        const isDirectVideo = /\.(mp4|mkv|avi|webm|mov)$/i.test(src.split('?')[0]);

        let hls: Hls;

        const setupVideo = () => {
            if (initialTime > 0 && !hasAppliedInitialTime.current) {
                console.log('[VideoPlayer] Seeking to initial time:', initialTime);
                video.currentTime = initialTime;
                hasAppliedInitialTime.current = true;
            }
            if (autoPlay) {
                video.play().catch(e => console.warn('[VideoPlayer] Play failed:', e));
            }
        };

        if (isHLS && Hls.isSupported()) {
            console.log('[VideoPlayer] Initializing HLS.js for:', src);
            hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 90
            });

            hls.loadSource(src);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                console.log('[VideoPlayer] HLS Manifest parsed.');
                setupVideo();
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
                console.error('[VideoPlayer] HLS Error:', data.type, data.details, data.fatal ? '(FATAL)' : '');
                if (data.fatal) {
                    setError(`Stream error: ${data.details}. Retrying...`);
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            hls.recoverMediaError();
                            break;
                        default:
                            hls.destroy();
                            setError('Fatal playback error.');
                            break;
                    }
                }
            });
        } else {
            // Direct video file or native HLS (Safari)
            video.src = src;
            const handleLoadedMetadataInternal = () => {
                setDuration(video.duration);
                if (onMetadata) onMetadata(video.duration);
                setupVideo();
            };
            video.addEventListener('loadedmetadata', handleLoadedMetadataInternal, { once: true });

            video.addEventListener('error', (e) => {
                const error = video.error;
                if (!isDirectVideo && !Hls.isSupported()) {
                    setError('Your browser does not support HLS playback.');
                } else {
                    setError(`Playback Error: ${error?.message || 'The video could not be loaded.'}`);
                }
            }, { once: true });
        }

        // Event listeners for UI state
        const updatePlayState = () => setIsPlaying(!video.paused);
        const handleTimeUpdate = () => {
            if (!isSeeking) {
                setCurrentTime(video.currentTime);
            }

            // Guard: Don't send progress if we're at 0 but expecting to seek to an initial time
            const isAtStart = video.currentTime === 0;
            const waitingForSeek = initialTime > 0 && !hasAppliedInitialTime.current;

            if (onProgress && (!isAtStart || !waitingForSeek)) {
                onProgress(video.currentTime, video.duration);
            }
        };
        const handleLoadedMetadata = () => {
            setDuration(video.duration);
            if (onMetadata) onMetadata(video.duration);
        };
        const handleEnded = () => {
            if (onNext) {
                onNext();
            }
        };

        video.addEventListener('play', updatePlayState);
        video.addEventListener('pause', updatePlayState);
        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('ended', handleEnded);

        return () => {
            if (hls) hls.destroy();
            video.removeEventListener('play', updatePlayState);
            video.removeEventListener('pause', updatePlayState);
            video.removeEventListener('timeupdate', handleTimeUpdate);
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
            video.removeEventListener('ended', handleEnded);
        };
    }, [src, autoPlay]);

    // Dedicated effect to handle initialTime seeking (especially if it arrives late)
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !initialTime || hasAppliedInitialTime.current) return;

        const applySeek = () => {
            // Only apply if we haven't moved much (avoid jumping back if user already started watching)
            if (initialTime > 0 && !hasAppliedInitialTime.current && video.currentTime < 5) {
                console.log('[VideoPlayer] Applying initialTime late:', initialTime);
                video.currentTime = initialTime;
                hasAppliedInitialTime.current = true;
            }
        };

        if (video.readyState >= 1) {
            applySeek();
        } else {
            const onMetadata = () => {
                applySeek();
                video.removeEventListener('loadedmetadata', onMetadata);
            };
            video.addEventListener('loadedmetadata', onMetadata);
            return () => video.removeEventListener('loadedmetadata', onMetadata);
        }
    }, [initialTime]);

    const togglePlay = () => {
        if (videoRef.current) {
            if (videoRef.current.paused) videoRef.current.play();
            else videoRef.current.pause();
        }
    };

    const toggleMute = () => {
        if (videoRef.current) {
            videoRef.current.muted = !videoRef.current.muted;
            setIsMuted(videoRef.current.muted);
        }
    };

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(e.target.value);
        setCurrentTime(time);
        if (videoRef.current) {
            videoRef.current.currentTime = time;
        }
    };

    const skip = (seconds: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime += seconds;
        }
    };

    const handleInteraction = () => {
        setShowControls(true);
        clearTimeout(controlsTimeout);
        controlsTimeout = setTimeout(() => {
            if (isPlaying) setShowControls(false);
        }, 5000);
    };

    // Note: Back navigation (Escape/Backspace) is now handled by the global useTvNavigation hook
    // via the NavigationContext. The onBack handler is registered above using useNavigationOverride.

    const isLive = duration === Infinity || duration === 0;

    return (
        <div
            ref={containerRef}
            className="relative w-full aspect-video bg-black group overflow-hidden rounded-lg shadow-2xl border border-[#333]"
            onMouseMove={handleInteraction}
            onMouseLeave={() => isPlaying && setShowControls(false)}
            onDoubleClick={toggleFullscreen}
            onTouchStart={handleInteraction}
        >
            <video
                ref={videoRef}
                className="w-full h-full object-contain cursor-pointer"
                poster={poster}
                playsInline
                onClick={togglePlay}
                onTouchStart={(e) => {
                    e.stopPropagation();
                    handleInteraction();
                }}
            />

            {/* Error Overlay */}
            {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
                    <div className="text-center text-red-500">
                        <AlertTriangle size={48} className="mx-auto mb-2" />
                        <p>{error}</p>
                    </div>
                </div>
            )}

            {/* Controls Overlay */}
            <div className={`absolute inset-0 z-10 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                {/* Top Bar with Back Button */}
                {onBack && (
                    <div className="absolute top-0 left-0 w-full p-6 bg-gradient-to-b from-black/80 to-transparent">
                        <button
                            onClick={onBack}
                            className="bg-black/50 hover:bg-white/20 p-3 rounded-full text-white transition-all transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-red-600"
                            title="Voltar"
                        >
                            <ArrowLeft size={28} />
                        </button>
                    </div>
                )}

                <div className={`absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/95 via-black/70 to-transparent p-4`}>

                    {/* Progress Bar */}
                    {!isLive && (
                        <div className="mb-4 group/progress">
                            <input
                                type="range"
                                min={0}
                                max={duration || 0}
                                value={currentTime}
                                onChange={handleSeek}
                                onMouseDown={() => setIsSeeking(true)}
                                onMouseUp={() => setIsSeeking(false)}
                                className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-red-600 hover:h-2 transition-all"
                            />
                            <div className="flex justify-between mt-2 text-xs text-gray-300 font-medium tracking-wider">
                                <span>{formatTime(currentTime)}</span>
                                <span>{formatTime(duration)}</span>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 lg:gap-6">
                            {/* Previous Episode (Series Only) */}
                            {onPrevious && (hasPrevious || true) && (
                                <button
                                    onClick={onPrevious}
                                    disabled={!hasPrevious}
                                    className={`text-white transition-all focus:outline-none focus:scale-125 ${!hasPrevious ? 'opacity-30 cursor-not-allowed' : 'hover:text-red-500'}`}
                                    title="Episódio Anterior"
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>
                                </button>
                            )}

                            <button
                                onClick={() => skip(-10)}
                                className="text-white hover:text-red-500 transition-colors focus:outline-none focus:scale-125"
                                title="Voltar 10s"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" /></svg>
                            </button>

                            <button
                                onClick={togglePlay}
                                data-focusable="true"
                                tabIndex={0}
                                className="text-white hover:text-red-500 transition-colors focus:outline-none focus:scale-125"
                            >
                                {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" />}
                            </button>

                            <button
                                onClick={() => skip(10)}
                                className="text-white hover:text-red-500 transition-colors focus:outline-none focus:scale-125"
                                title="Avançar 10s"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><path d="M13 17l5-5-5-5M6 17l5-5-5-5" /></svg>
                            </button>

                            {/* Next Episode (Series Only) */}
                            {onNext && (hasNext || true) && (
                                <button
                                    onClick={onNext}
                                    disabled={!hasNext}
                                    className={`text-white transition-all focus:outline-none focus:scale-125 ${!hasNext ? 'opacity-30 cursor-not-allowed' : 'hover:text-red-500'}`}
                                    title="Próximo Episódio"
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>
                                </button>
                            )}

                            <button
                                onClick={toggleMute}
                                data-focusable="true"
                                tabIndex={0}
                                className="text-white hover:text-gray-300 transition-colors focus:outline-none focus:scale-125 ml-2"
                            >
                                {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
                            </button>

                            {isLive && (
                                <div className="text-white text-sm font-medium">
                                    <span className="bg-red-600 px-2 py-0.5 rounded text-xs uppercase tracking-tight">Ao Vivo</span>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-4">
                            <button
                                onClick={toggleFullscreen}
                                data-focusable="true"
                                tabIndex={0}
                                className="text-white hover:text-gray-300 transition-colors focus:outline-none focus:scale-125"
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
