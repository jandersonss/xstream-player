'use client';

import { useData } from '../context/DataContext';
import { useWatchProgress } from '../context/WatchProgressContext';
import { useTMDb } from '../context/TMDbContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo, useRef } from 'react';
import { apiFetch } from '@/app/lib/apiClient';
import HeroSection from '@/components/HeroSection';
import HomeShortcuts from '@/components/HomeShortcuts';
import Row from '@/components/ui/Row';
import Poster from '@/components/ui/Poster';
import { SkeletonRow } from '@/components/ui/Skeleton';

interface CarouselItemData {
    id: string | number;
    name: string;
    image: string;
    rating?: number | string;
    year?: number;
    type: 'movie' | 'series';
}

interface CarouselData {
    id: string;
    title: string;
    type: 'movie' | 'series';
    data: CarouselItemData[];
    categoryId?: string | number;
}

export default function Dashboard() {
    const { lastSync } = useData();
    const { progressMap } = useWatchProgress();
    // Kept only as an effect dependency: carousels can include TMDb-sourced
    // content, so a configuration change must trigger a refetch even though
    // no TMDb UI lives on this screen anymore (that moved to Ajustes).
    const { isConfigured } = useTMDb();

    const [carouselData, setCarouselData] = useState<CarouselData[]>([]);
    const [isLoadingCarousels, setIsLoadingCarousels] = useState(false);
    const router = useRouter();

    // Progressive reveal: only the first 3 carousels render on mount; the rest
    // reveal in batches as the sentinel scrolls into view. Falls back to a
    // manual button so carousels stay reachable even when IntersectionObserver
    // is the no-op polyfill from app/polyfills.ts (older WebOS browsers).
    const CAROUSEL_BATCH_SIZE = 3;
    const [visibleCarouselCount, setVisibleCarouselCount] = useState(CAROUSEL_BATCH_SIZE);
    const carouselSentinelRef = useRef<HTMLDivElement | null>(null);
    const visibleCarousels = carouselData.slice(0, visibleCarouselCount);
    const hasMoreCarousels = visibleCarouselCount < carouselData.length;

    useEffect(() => {
        setVisibleCarouselCount(CAROUSEL_BATCH_SIZE);
    }, [carouselData]);

    useEffect(() => {
        const sentinel = carouselSentinelRef.current;
        if (!sentinel || typeof IntersectionObserver === 'undefined') return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisibleCarouselCount(prev => Math.min(prev + CAROUSEL_BATCH_SIZE, carouselData.length));
                }
            },
            { threshold: 0.1 }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMoreCarousels, carouselData.length, visibleCarouselCount]);

    const continueWatching = useMemo(() => {
        return Object.values(progressMap)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 10)
            .map(item => ({
                id: item.streamId,
                name: item.name,
                image: item.image,
                progress: item.progress,
                duration: item.duration,
                href: item.type === 'movie'
                    ? `/dashboard/watch/movie/${item.streamId}?autoplay=true`
                    : `/dashboard/watch/series/${item.seriesId || item.streamId}?autoplay=true&episode=${item.episodeId || ''}`
            }));
    }, [progressMap]);

    // Load carousels from backend
    useEffect(() => {
        const loadCarousels = async () => {
            setIsLoadingCarousels(true);
            try {
                const response = await apiFetch('/api/catalog/carousels');
                if (!response.ok) throw new Error('Failed to fetch carousels');
                const result = await response.json();
                setCarouselData(result.data || []);
            } catch (error) {
                console.error('Failed to load carousels:', error);
            } finally {
                setIsLoadingCarousels(false);
            }
        };

        loadCarousels();
    }, [isConfigured, lastSync]);

    const showSkeletons = isLoadingCarousels && carouselData.length === 0;

    return (
        <>
            {/* Simple brand header for mobile only — the nav rail carries the
                brand on desktop (spec 02). No settings pills here anymore;
                that content moved to /dashboard/settings. */}
            <div className="md:hidden px-6 pt-6 pb-2">
                <span className="text-lg font-semibold text-ink">Xstream</span>
            </div>

            {/* Hero is full-bleed, outside the page's horizontal padding */}
            <HeroSection />

            <div className="px-6 md:px-10 lg:px-14 pb-12 pt-6 space-y-10 md:space-y-12">
                <HomeShortcuts />

                {continueWatching.length > 0 && (
                    <Row title="Continuar assistindo" itemWidth="wide">
                        {continueWatching.map(item => (
                            <Poster
                                key={`${item.id}`}
                                href={item.href}
                                title={item.name}
                                image={item.image}
                                ratio="wide"
                                progress={item.duration > 0 ? item.progress / item.duration : undefined}
                            />
                        ))}
                    </Row>
                )}

                {visibleCarousels.map((carousel) => (
                    <Row
                        key={carousel.id}
                        title={carousel.title}
                        itemWidth="poster"
                        onViewAll={carousel.categoryId ? () => {
                            router.push(`/dashboard/${carousel.type === 'movie' ? 'movies' : 'series'}/${carousel.categoryId}`);
                        } : undefined}
                    >
                        {carousel.data.map(item => (
                            <Poster
                                key={`${carousel.id}-${item.id}`}
                                href={item.type === 'movie'
                                    ? `/dashboard/watch/movie/${item.id}`
                                    : `/dashboard/watch/series/${item.id}`}
                                title={item.name}
                                image={item.image}
                                ratio="poster"
                                rating={item.rating}
                                year={item.year}
                            />
                        ))}
                    </Row>
                ))}

                {showSkeletons && (
                    <>
                        <SkeletonRow itemWidth="poster" />
                        <SkeletonRow itemWidth="poster" />
                    </>
                )}

                {/* Sentinel to progressively reveal remaining carousels; button is a fallback
                    for browsers where IntersectionObserver is a no-op polyfill (see app/polyfills.ts) */}
                {hasMoreCarousels && (
                    <div ref={carouselSentinelRef} className="flex justify-center py-4">
                        <button
                            data-focusable="true"
                            tabIndex={0}
                            onClick={() => setVisibleCarouselCount(prev => Math.min(prev + CAROUSEL_BATCH_SIZE, carouselData.length))}
                            className="px-4 py-2 text-sm text-ink-2 hover:text-ink border border-line rounded-lg"
                        >
                            Carregar mais categorias
                        </button>
                    </div>
                )}
            </div>
        </>
    );
}
