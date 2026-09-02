'use client';

import { useState, useEffect, useCallback, useRef, TouchEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Bookmark } from 'lucide-react';
import { useAuth } from '../app/context/AuthContext';
import { useFavorites } from '../app/context/FavoritesContext';
import { apiFetch } from '../app/lib/apiClient';
import Button from './ui/Button';
import Badge from './ui/Badge';

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
    const { addFavorite, removeFavorite, isFavorite } = useFavorites();

    const [heroItems, setHeroItems] = useState<HeroItem[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [showLogo, setShowLogo] = useState(false);

    // Video State
    const [videoKey, setVideoKey] = useState<string | null>(null);
    const [showVideo, setShowVideo] = useState(true);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const touchStartX = useRef<number | null>(null);
    const touchStartY = useRef<number | null>(null);

    // Detect TV browsers to disable heavy iframe
    const isTV = typeof window !== 'undefined' && /Web0S|WebOS|Tizen|SmartTV|Roku/i.test(navigator.userAgent);

    const handleWatch = useCallback(() => {
        if (!heroItems.length) return;
        const item = heroItems[currentIndex];
        router.push(
            item.type === 'movie'
                ? `/dashboard/watch/movie/${item.id}`
                : `/dashboard/watch/series/${item.id}`
        );
    }, [heroItems, currentIndex, router]);

    const handleToggleFavorite = useCallback(() => {
        if (!heroItems.length) return;
        const item = heroItems[currentIndex];
        if (isFavorite(item.id, item.type)) {
            removeFavorite(item.id, item.type);
        } else {
            addFavorite({
                id: item.id,
                type: item.type,
                name: item.title,
                image: item.poster || item.backdrop,
                rating: item.rating.toFixed(1),
            });
        }
    }, [heroItems, currentIndex, isFavorite, addFavorite, removeFavorite]);

    // Slides are browsed through the indicators below, which switch on focus —
    // not by hijacking Left/Right on the action buttons. Intercepting the keys
    // there would pin focus on "Assistir" forever: the slide would change under
    // a cursor that never reaches "Minha lista".
    const handleIndicatorFocus = useCallback((index: number) => {
        setCurrentIndex(index);
    }, []);

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
            const response = await apiFetch(`/api/catalog/hero?type=${type}`);
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
    const isCurrentFavorite = isFavorite(currentItem.id, currentItem.type);

    return (
        <div
            className="relative w-full h-[52vh] md:h-[64vh] lg:h-[76vh] overflow-hidden"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            aria-roledescription="carousel"
        >
            <div className="relative w-full h-full overflow-hidden">
                {/* Background Image / Video Placeholder */}
                <div className="absolute inset-0 z-0 w-full">
                    {/* Fallback Image */}
                    <div
                        className={`absolute inset-0 bg-cover bg-center bg-no-repeat transition-all duration-1000 ease-in-out transform scale-105 ${showVideo ? 'opacity-0' : 'opacity-100'}`}
                        style={{ backgroundImage: `url(${currentItem.backdrop})` }}
                    />

                    {/* Video Player */}
                    {!isTV && videoKey && (
                        <div className={`absolute w-full h-full inset-0 transition-opacity duration-1000 ${showVideo ? 'opacity-100' : 'opacity-0'}`}>
                            <iframe
                                ref={iframeRef}
                                className="w-full h-full scale-150 pointer-events-none"
                                src={`https://www.youtube.com/embed/${videoKey}?autoplay=1&mute=0&controls=0&showinfo=0&rel=0&iv_load_policy=3&modestbranding=1&enablejsapi=1&loop=1&playlist=${videoKey}&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`}
                                title="Trailer"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            />
                        </div>
                    )}
                </div>

                {/* Bottom gradient — lets the text sit on top of any backdrop */}
                <div className="absolute inset-0 z-10 bg-gradient-to-t from-bg via-bg/60 to-transparent" />
                {/* Lateral gradient over the left half — extra contrast for bright images */}
                <div className="absolute inset-0 z-10 w-1/2 bg-gradient-to-r from-bg/80 to-transparent" />
            </div>

            {/* Content Container */}
            <div className="absolute inset-0 z-20 flex flex-col justify-end pb-16 md:pb-20 px-6 md:px-16 w-full">
                <div
                    className={`transition-all duration-700 transform ${showLogo ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}
                >
                    {/* Metadata Tags */}
                    {/* Block-level wrappers, not inline spans: an inline flex item
                        keeps its baseline descender space, which made the badge
                        carrying the monospace rating sit higher than its siblings. */}
                    <div className="flex items-center mb-3">
                        <Badge tone="neutral">{currentItem.type === 'movie' ? 'Filme' : 'Série'}</Badge>
                        <div className="ml-2">
                            <Badge tone="neutral">{currentItem.year}</Badge>
                        </div>
                        <div className="ml-2">
                            <Badge tone="rating">
                                {/* No `leading-none` here: the other badges take
                                    their height from the text-xs line box, so
                                    overriding it made this one visibly shorter. */}
                                <span className="tnum">{currentItem.rating.toFixed(1)}</span>
                            </Badge>
                        </div>
                    </div>

                    {/* Title */}
                    <h1 className="text-3xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-ink mb-3 leading-tight max-w-4xl">
                        {currentItem.title}
                    </h1>

                    {/* Description */}
                    <p className="text-sm md:text-base text-ink-2 max-w-2xl line-clamp-2 mb-6">
                        {currentItem.description}
                    </p>

                    {/* Explicit actions — the D-pad reaches these, not the hero itself */}
                    <div className="flex items-center">
                        <Button variant="primary" size="lg" icon={Play} onClick={handleWatch} className="mr-3">
                            Assistir
                        </Button>
                        <Button
                            variant="secondary"
                            size="lg"
                            onClick={handleToggleFavorite}
                        >
                            <Bookmark
                                size={20}
                                className="mr-2"
                                fill={isCurrentFavorite ? 'currentColor' : 'none'}
                            />
                            {isCurrentFavorite ? 'Na sua lista' : 'Minha lista'}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Pagination / Indicators */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex flex-row items-center">
                {heroItems.map((_, idx) => (
                    <button
                        key={idx}
                        onClick={() => setCurrentIndex(idx)}
                        onFocus={() => handleIndicatorFocus(idx)}
                        data-focusable="true"
                        tabIndex={0}
                        className="focus-flat px-2 py-3 flex items-center justify-center"
                        aria-label={`Ir para slide ${idx + 1}`}
                        aria-current={idx === currentIndex ? 'true' : undefined}
                    >
                        <span
                            className={`block h-0.5 rounded-full transition-all duration-300 ${idx === currentIndex ? 'w-8 bg-ink' : 'w-4 bg-line-strong'}`}
                        />
                    </button>
                ))}
            </div>
        </div>
    );
}
