'use client';

import { useState, useEffect, useCallback, useRef, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '../app/context/AuthContext';
import { useData } from '../app/context/DataContext';
import { useTMDb } from '../app/context/TMDbContext';
import {
    getDailySeed,
    shuffleWithSeed,
    prepareForMatching,
    findBestMatch,
    getTMDbImageUrl,
    TMDbMovie,
    TMDbTVShow
} from '../app/lib/tmdb';
import {
    CachedStream,
    saveCarouselCache,
    getCarouselCache
} from '../app/lib/db';

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
}

interface HeroSectionProps {
    type?: 'all' | 'movie' | 'series';
}

const NEXT_DELAY = 30000;

export default function HeroSection({ type = 'all' }: HeroSectionProps) {
    const { user } = useAuth();
    const { getAllCachedStreams } = useData();
    const { fetchTrending, isConfigured, fetchVideos } = useTMDb();
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

    useEffect(() => {
        if (heroItems.length <= 1) return;

        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % heroItems.length);
        }, NEXT_DELAY); // Increased duration to allow trailer viewing

        return () => clearInterval(interval);
    }, [heroItems.length]);

    // Animate logo/text entrance on slide change & Fetch Video
    useEffect(() => {
        setShowLogo(false);
        setShowVideo(false);
        setVideoKey(null);

        if (heroItems.length > 0) {
            const currentItem = heroItems[currentIndex];

            // Fetch video for current item using TMDB ID if available
            const loadVideo = async () => {
                if (!isConfigured || !currentItem.tmdbId) return;

                try {
                    const videos = await fetchVideos(currentItem.type, currentItem.tmdbId); // Use tmdbId here
                    console.log('HeroSection: Fetched videos', videos);
                    // Prioritize Official Trailer -> Trailer -> Teaser
                    const trailer = videos.find(v => v.site === 'YouTube' && v.type === 'Trailer' && v.official)
                        || videos.find(v => v.site === 'YouTube' && v.type === 'Trailer')
                        || videos.find(v => v.site === 'YouTube' && v.type === 'Teaser');

                    if (trailer) {
                        setVideoKey(trailer.key);
                        // Delay showing video to allow buffering behind backdrop
                        setTimeout(() => setShowVideo(true), 2000);
                    }
                } catch (error) {
                    console.error('Failed to load video', error);
                }
            };

            loadVideo();
        }

        const timer = setTimeout(() => setShowLogo(true), 500);
        return () => clearTimeout(timer);
    }, [currentIndex, heroItems, isConfigured, fetchVideos]);

    const fetchHeroContent = useCallback(async () => {
        const today = new Date();
        const dateKey = `hero-${type}-${today.toISOString().split('T')[0]}`;

        // 1. Check Cache
        try {
            const cached = await getCarouselCache(dateKey);
            if (cached && cached.length > 0) {
                console.log('HeroSection: Using cached items', cached.length);
                setHeroItems(cached);
                setIsLoading(false);
                return;
            }
        } catch (e) {
            console.warn('Hero cache miss');
        }

        if (!user) return;

        try {
            // 2. Fetch Sources based on type
            let movies: CachedStream[] = [];
            let series: CachedStream[] = [];

            if (type === 'all' || type === 'movie') {
                movies = await getAllCachedStreams('movie');
            }
            if (type === 'all' || type === 'series') {
                series = await getAllCachedStreams('series');
            }

            console.log(`HeroSection: Fetched ${movies.length} movies and ${series.length} series`);

            // Prepare local DB for matching
            const preparedMovies = prepareForMatching(movies);
            const preparedSeries = prepareForMatching(series);

            let potentialItems: HeroItem[] = [];

            // B. Get TMDB Trending and match
            if (isConfigured) {
                try {
                    console.log('HeroSection: Fetching TMDB Trending...');
                    const trending = await fetchTrending();
                    console.log(`HeroSection: Found ${trending.length} trending items. Matching...`);

                    for (const item of trending) {
                        const isMovie = 'title' in item;

                        // Filter by requested type
                        if (type === 'movie' && !isMovie) continue;
                        if (type === 'series' && isMovie) continue;

                        const title = isMovie ? (item as TMDbMovie).title : (item as TMDbTVShow).name;
                        const db = isMovie ? preparedMovies : preparedSeries;

                        const match = findBestMatch<CachedStream>(title, db, 0.85);

                        if (match && match.item.data && item.backdrop_path) {
                            potentialItems.push({
                                id: match.item.id as string,
                                tmdbId: item.id, // Store the TMDB ID
                                title: title,
                                description: item.overview,
                                backdrop: getTMDbImageUrl(item.backdrop_path), // Original, high res
                                poster: getTMDbImageUrl(item.poster_path),
                                type: isMovie ? 'movie' : 'series',
                                rating: item.vote_average,
                                year: new Date(isMovie ? (item as TMDbMovie).release_date : (item as TMDbTVShow).first_air_date).getFullYear()
                            });
                        }
                    }
                    console.log(`HeroSection: Matched ${potentialItems.length} items from TMDB.`);
                } catch (err) {
                    console.error('HeroSection: Error matching TMDB', err);
                }
            } else {
                console.log('HeroSection: TMDB not configured.');
            }

            // C. Fallback: If not enough items, fill with random local high-rated/recent content
            if (potentialItems.length < 5) {
                console.log('HeroSection: detailed matches < 5, filling with random local content...');

                const allContent = [...movies, ...series];
                const seed = getDailySeed() + (type === 'movie' ? 1 : type === 'series' ? 2 : 0); // Varry seed by type
                const shuffledLocal = shuffleWithSeed(allContent, seed);

                for (const item of shuffledLocal) {
                    if (potentialItems.length >= 5) break;

                    // Skip if already added
                    if (potentialItems.some(pi => pi.id === String(item.id))) continue;

                    // Construct a fallback item
                    // Use icon as backdrop (will be blurred/streched but better than nothing)
                    // Or check if 'backdrop_path' exists in item.data
                    let backdrop = item.data?.backdrop_path ? getTMDbImageUrl(item.data.backdrop_path) : (item.icon || '');
                    // Verify URL valid
                    if (!backdrop || backdrop.includes('placeholder')) backdrop = item.icon || '';
                    if (!backdrop) continue; // Skip if no image at all

                    potentialItems.push({
                        id: String(item.id),
                        title: item.name,
                        description: item.data?.plot || item.data?.description || 'Sinopse indisponível.',
                        backdrop: backdrop,
                        poster: item.icon || '',
                        type: item.type === 'series' ? 'series' : 'movie',
                        rating: item.rating ? Number(item.rating) : 0,
                        year: new Date().getFullYear() // Fallback unknown
                    });
                }
            }

            // Deduplicate by ID
            const uniqueItems = Array.from(new Map(potentialItems.map(item => [item.id, item])).values());
            console.log(`HeroSection: Total unique items available: ${uniqueItems.length}`);

            // D. Shuffle and Pick 5
            const seed = getDailySeed() + (type === 'movie' ? 10 : type === 'series' ? 20 : 0); // Varry seed by type
            const shuffled = shuffleWithSeed(uniqueItems, seed);
            const selected = shuffled.slice(0, 5);

            if (selected.length > 0) {
                setHeroItems(selected);
                saveCarouselCache(dateKey, selected);
            } else {
                console.warn('HeroSection: No items could be selected even after fallback.');
            }

        } catch (error) {
            console.error('Failed to load hero content', error);
        } finally {
            setIsLoading(false);
        }
    }, [user, isConfigured, getAllCachedStreams, fetchTrending, fetchVideos, type]);

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
                    {videoKey && (
                        <div className={`absolute w-full h-full inset-0 transition-opacity duration-1000 ${showVideo ? 'opacity-100' : 'opacity-0'}`}>
                            <iframe
                                ref={iframeRef}
                                className="aspect-video scale-150 pointer-events-none"
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
                        <span className="px-2 py-1 bg-white/20 backdrop-blur-md text-white text-xs font-bold rounded border border-white/10">
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
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex flex-row items-center gap-2">
                {heroItems.map((_, idx) => (
                    <button
                        key={idx}
                        onClick={(e) => { e.stopPropagation(); setCurrentIndex(idx); }}
                        className={`h-1.5 rounded-full transition-all duration-300 ${idx === currentIndex
                            ? 'w-8 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] shadow-lg'
                            : 'w-4 bg-white/30 hover:bg-white/50'
                            }`}
                        aria-label={`Ir para slide ${idx + 1}`}
                        aria-current={idx === currentIndex ? 'true' : undefined}
                    />
                ))}
            </div>

        </div>
    );
}
