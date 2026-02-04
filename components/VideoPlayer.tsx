'use client';

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Maximize, Minimize, Play, Pause, Volume2, VolumeX, AlertTriangle } from 'lucide-react';

interface VideoPlayerProps {
    src: string;
    poster?: string;
    autoPlay?: boolean;
}

export default function VideoPlayer({ src, poster, autoPlay = true }: VideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [error, setError] = useState('');
    const [showControls, setShowControls] = useState(true);

    let controlsTimeout: NodeJS.Timeout;

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        // Reset error on src change
        setError('');

        const isHLS = src.toLowerCase().includes('.m3u8');
        const isDirectVideo = /\.(mp4|mkv|avi|webm|mov)$/i.test(src.split('?')[0]);

        let hls: Hls;

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
                console.log('[VideoPlayer] HLS Manifest parsed. Quality levels:', data.levels.length);
                if (autoPlay) {
                    console.log('[VideoPlayer] Attempting autoplay...');
                    video.play().catch(e => console.warn('[VideoPlayer] Autoplay blocked or failed:', e));
                }
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
                console.error('[VideoPlayer] HLS Error:', data.type, data.details, data.fatal ? '(FATAL)' : '');
                if (data.fatal) {
                    setError(`Stream error: ${data.details}. Retrying...`);
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            console.log('[VideoPlayer] Network error, trying to recover...');
                            hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            console.log('[VideoPlayer] Media error, trying to recover...');
                            hls.recoverMediaError();
                            break;
                        default:
                            console.log('[VideoPlayer] Fatal error, destroying HLS instance.');
                            hls.destroy();
                            setError('Fatal playback error.');
                            break;
                    }
                }
            });
        } else {
            // Direct video file or native HLS (Safari)
            console.log(`[VideoPlayer] Using native playback ${isDirectVideo ? '(Direct Video)' : '(Native HLS/Other)'} for:`, src);
            video.src = src;
            if (autoPlay) {
                video.addEventListener('loadedmetadata', () => {
                    console.log('[VideoPlayer] Native Playback: Metadata loaded, playing...');
                    video.play().catch(e => console.warn('[VideoPlayer] Native autoplay failed:', e));
                }, { once: true });
            }
            video.addEventListener('error', (e) => {
                const error = video.error;
                console.error('[VideoPlayer] Native Video Error:', error);

                // If it failed because we tried to play it natively but it's an HLS stream in a non-Safari browser
                if (!isDirectVideo && !Hls.isSupported()) {
                    setError('Your browser does not support HLS playback.');
                } else {
                    setError(`Playback Error: ${error?.message || 'The video could not be loaded.'}`);
                }
            }, { once: true });
        }

        // Event listeners for UI state
        const updatePlayState = () => setIsPlaying(!video.paused);
        video.addEventListener('play', updatePlayState);
        video.addEventListener('pause', updatePlayState);

        return () => {
            if (hls) hls.destroy();
            video.removeEventListener('play', updatePlayState);
            video.removeEventListener('pause', updatePlayState);
        };
    }, [src, autoPlay]);

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

    const handleInteraction = () => {
        setShowControls(true);
        clearTimeout(controlsTimeout);
        controlsTimeout = setTimeout(() => {
            if (isPlaying) setShowControls(false);
        }, 5000);
    };

    useEffect(() => {
        window.addEventListener('keydown', handleInteraction);
        return () => window.removeEventListener('keydown', handleInteraction);
    }, [isPlaying]);

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
            <div className={`absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/90 to-transparent p-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={togglePlay}
                            data-focusable="true"
                            tabIndex={0}
                            className="text-white hover:text-red-500 transition-colors focus:outline-none focus:scale-125"
                        >
                            {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
                        </button>

                        <button
                            onClick={toggleMute}
                            data-focusable="true"
                            tabIndex={0}
                            className="text-white hover:text-gray-300 transition-colors focus:outline-none focus:scale-125"
                        >
                            {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
                        </button>

                        <div className="text-white text-sm font-medium">
                            <span className="bg-red-600 px-2 py-0.5 rounded text-xs ml-2 uppercase tracking-tight">Live</span>
                        </div>
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
    );
}
