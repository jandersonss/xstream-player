'use client';

import { useState, useEffect, useCallback, useRef, KeyboardEvent, TouchEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '../app/context/AuthContext';

interface HeroItem {
    id: string;
    tmdbId?: number; // Store TMDB ID for fetching extras
    title: string;
    description: string;
    backdrop: string;
    poster: string;
    type: 'movie' | 'series';
    rating: number;
    year: number;
    logo?: string;
    videoKey?: string | null;
}

interface HeroSectionProps {
    type?: 'all' | 'movie' | 'series';
}

const NEXT_DELAY = 30000;

export default function HeroSection({ type = 'all' }: HeroSectionProps) {
    const { user } = useAuth();
    const router = useRouter();

    const [heroItems, setHeroItems] = useState<HeroItem[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [showLogo, setShowLogo] = useState(false);

    // Video State
    const [videoKey, setVideoKey] = useState<string | null>(null);
    const [showVideo, setShowVideo] = useState(true);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const heroRef = useRef<HTMLDivElement>(null);
    const touchStartX = useRef<number | null>(null);
    const touchStartY = useRef<number | null>(null);

    // Detect TV browsers to disable heavy iframe
    const isTV = typeof window !== 'undefined' && /Web0S|WebOS|Tizen|SmartTV|Roku/i.test(navigator.userAgent);

    const handleNavigate = useCallback(() => {
        if (!heroItems.length) return;
        const item = heroItems[currentIndex];
        router.push(
            item.type === 'movie'
                ? `/dashboard/watch/movie/${item.id}`
                : `/dashboard/watch/series/${item.id}`
        );
    }, [heroItems, currentIndex, router]);

    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'ArrowRight') {
            // At last item: let focus move to the next element naturally
            if (currentIndex < heroItems.length - 1) {
                e.preventDefault();
                setCurrentIndex((prev) => prev + 1);
            }
        } else if (e.key === 'ArrowLeft') {
            // At first item: let focus move to the previous element naturally
            if (currentIndex > 0) {
                e.preventDefault();
                setCurrentIndex((prev) => prev - 1);
            }
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleNavigate();
        }
    }, [currentIndex, heroItems.length, handleNavigate]);

    const handleTouchStart = useCallback((e: TouchEvent<HTMLDivElement>) => {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
    }, []);

    const handleTouchEnd = useCallback((e: TouchEvent<HTMLDivElement>) => {
        if (touchStartX.current === null || touchStartY.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        const dy = e.changedTouches[0].clientY - touchStartY.current;
        touchStartX.current = null;
        touchStartY.current = null;
        // Only handle horizontal swipes (horizontal movement > vertical)
        if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
        if (dx < 0) {
            // Swipe left → next
            setCurrentIndex((prev) => (prev + 1) % heroItems.length);
        } else {
            // Swipe right → previous
            setCurrentIndex((prev) => (prev - 1 + heroItems.length) % heroItems.length);
        }
    }, [heroItems.length]);

    useEffect(() => {
        if (heroItems.length <= 1) return;

        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % heroItems.length);
        }, NEXT_DELAY); // Increased duration to allow trailer viewing

        return () => clearInterval(interval);
    }, [heroItems.length]);

    // Animate logo/text entrance on slide change & play trailer if videoKey is present
    useEffect(() => {
        setShowLogo(false);
        setShowVideo(false);
        setVideoKey(null);

        let videoTimer: NodeJS.Timeout | null = null;
        if (heroItems.length > 0) {
            const currentItem = heroItems[currentIndex];
            if (currentItem.videoKey) {
                setVideoKey(currentItem.videoKey);
                videoTimer = setTimeout(() => {
                    if (!isTV) {
                        setShowVideo(true);
                    }
                }, 2000);
            }
        }

        const logoTimer = setTimeout(() => setShowLogo(true), 500);

        return () => {
            if (videoTimer) clearTimeout(videoTimer);
            clearTimeout(logoTimer);
        };
    }, [currentIndex, heroItems, isTV]);

    const fetchHeroContent = useCallback(async () => {
        if (!user) return;

        try {
            setIsLoading(true);
            const response = await fetch(`/api/catalog/hero?type=${type}`);
            if (!response.ok) throw new Error('Failed to fetch hero highlights');
            const result = await response.json();
            setHeroItems(result.data || []);
        } catch (error) {
            console.error('[HeroSection] Failed to load hero content', error);
        } finally {
            setIsLoading(false);
        }
    }, [user, type]);

    useEffect(() => {
        fetchHeroContent();
    }, [fetchHeroContent]);

    if (isLoading || heroItems.length === 0) return null;

    const currentItem = heroItems[currentIndex];

    // Background Image URL (using high res original if possible, but w500 is base in helper)
    // We might want to construct a w1280 URL manually for valid backdrops
    const backdropUrl = currentItem.backdrop.replace('w500', 'original');

    return (
        <div
            ref={heroRef}
            className="relative w-full h-[45vh] md:h-[60vh] lg:h-[85vh] overflow-hidden group outline-none cursor-pointer"
            tabIndex={0}
            data-focusable="true"
            data-carousel="true"
            onClick={handleNavigate}
            onKeyDown={handleKeyDown}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            aria-label="Hero carousel"
            aria-roledescription="carousel">
            <div
                className="relative w-full h-full overflow-hidden"
            >
                {/* Background Image / Video Placeholder */}
                <div className="absolute inset-0 z-0 w-full ">
                    {/* Fallback Image */}
                    <div
                        className={`absolute inset-0 bg-cover bg-center bg-no-repeat transition-all duration-1000 ease-in-out transform scale-105 group-hover:scale-110 ${showVideo ? 'opacity-0' : 'opacity-100'}`}
                        style={{ backgroundImage: `url(${backdropUrl})` }}
                    />

                    {/* Video Player */}
                    {!isTV && videoKey && (
                        <div className={`absolute w-full h-full inset-0 transition-opacity duration-1000 ${showVideo ? 'opacity-100' : 'opacity-0'}`}>
                            <iframe
                                ref={iframeRef}
                                className="w-full h-full aspect-video scale-150 pointer-events-none"
                                src={`https://www.youtube.com/embed/${videoKey}?autoplay=1&mute=0&controls=0&showinfo=0&rel=0&iv_load_policy=3&modestbranding=1&enablejsapi=1&loop=1&playlist=${videoKey}&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`}
                                title="Trailer"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            />
                        </div>
                    )}
                </div>
            </div>
            {/* Content Container */}
            <div className="absolute inset-0 z-20 flex flex-col justify-end pb-16 md:pb-15 px-6 md:px-16 w-full pointer-events-none bg-gradient-to-t from-black via-black/10 from-20% to-transparent">
                <div
                    className={`transition-all duration-700 transform ${showLogo ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}
                >
                    {/* Metadata Tags */}
                    <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-1 bg-red-600 text-white text-xs font-bold rounded uppercase tracking-wider">
                            {currentItem.type === 'movie' ? 'Filme' : 'Série'}
                        </span>
                        <span className="px-2 py-1 bg-white/20  text-white text-xs font-bold rounded border border-white/10">
                            {currentItem.year}
                        </span>
                        <div className="flex items-center gap-1 text-yellow-500">
                            <span className="text-sm font-bold">{currentItem.rating.toFixed(1)}</span>
                        </div>
                    </div>

                    {/* Title */}
                    <h1 className="text-2xl md:text-4xl font-bold text-white mb-1 leading-tight max-w-4xl tracking-tight drop-shadow-2xl">
                        {currentItem.title}
                    </h1>

                    {/* Description */}
                    <p className="text-gray-300 text-base md:text-lg max-w-2xl line-clamp-3 md:line-clamp-2 drop-shadow-md">
                        {currentItem.description}
                    </p>
                </div>
            </div>

            {/* Pagination / Indicators */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex flex-row items-center">
                {heroItems.map((_, idx) => (
                    <button
                        key={idx}
                        onClick={(e) => { e.stopPropagation(); setCurrentIndex(idx); }}
                        className="px-2 py-3 flex items-center justify-center"
                        aria-label={`Ir para slide ${idx + 1}`}
                        aria-current={idx === currentIndex ? 'true' : undefined}
                    >
                        <span
                            className={`block h-1.5 rounded-full transition-all duration-300 ${idx === currentIndex
                                ? 'w-8 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]'
                                : 'w-4 bg-white/30 hover:bg-white/50'
                                }`}
                        />
                    </button>
                ))}
            </div>

        </div>
    );
}
