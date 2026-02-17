'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Info, Volume2, VolumeX } from 'lucide-react';
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
    const [isMuted, setIsMuted] = useState(true);
    const [showLogo, setShowLogo] = useState(false);

    // Video State
    const [videoKey, setVideoKey] = useState<string | null>(null);
    const [showVideo, setShowVideo] = useState(false);
    const iframeRef = useRef<HTMLIFrameElement>(null);

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

    // Handle Mute Toggle via PostMessage
    useEffect(() => {
        if (iframeRef.current && iframeRef.current.contentWindow) {
            const command = isMuted ? 'mute' : 'unMute';
            iframeRef.current.contentWindow.postMessage(JSON.stringify({
                event: 'command',
                func: command,
                args: []
            }), '*');
        }
    }, [isMuted, videoKey]);

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
        <div className="relative w-full h-[70vh] md:h-[85vh] overflow-hidden group">
            {/* Background Image / Video Placeholder */}
            <div className="absolute inset-0 z-0">
                {/* Fallback Image */}
                <div
                    className={`absolute inset-0 bg-cover bg-center bg-no-repeat transition-all duration-1000 ease-in-out transform scale-105 group-hover:scale-110 ${showVideo ? 'opacity-0' : 'opacity-100'}`}
                    style={{ backgroundImage: `url(${backdropUrl})` }}
                />

                {/* Video Player */}
                {videoKey && (
                    <div className={`absolute inset-0 transition-opacity duration-1000 ${showVideo ? 'opacity-100' : 'opacity-0'}`}>
                        <iframe
                            ref={iframeRef}
                            className="w-full h-full scale-150 pointer-events-none"
                            src={`https://www.youtube.com/embed/${videoKey}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&iv_load_policy=3&modestbranding=1&enablejsapi=1&loop=1&playlist=${videoKey}&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`}
                            title="Trailer"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        />
                    </div>
                )}

                {/* Gradient Overlays for Readability (OLED Dark Mode) */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/50 to-transparent pointer-events-none" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] from-10% via-[#0a0a0a]/40 to-transparent pointer-events-none" />
                <div className="absolute inset-0 bg-gradient-to-l from-[#0a0a0a] from-0% via-transparent to-transparent opacity-80 pointer-events-none" />
            </div>

            {/* Content Container */}
            <div className="absolute inset-0 z-10 flex flex-col justify-end pb-20 md:pb-24 px-6 md:px-16 max-w-7xl mx-auto w-full pointer-events-none">
                <div
                    className={`transition-all duration-700 transform ${showLogo ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'} pointer-events-auto`}
                >
                    {/* Metadata Tags */}
                    <div className="flex items-center gap-3 mb-4">
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
                    <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-4 leading-tight max-w-4xl tracking-tight drop-shadow-2xl">
                        {currentItem.title}
                    </h1>

                    {/* Description */}
                    <p className="text-gray-300 text-base md:text-lg max-w-2xl mb-8 line-clamp-3 md:line-clamp-2 drop-shadow-md">
                        {currentItem.description}
                    </p>

                    {/* Actions */}
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.push(currentItem.type === 'movie'
                                ? `/dashboard/watch/movie/${currentItem.id}?autoplay=true`
                                : `/dashboard/watch/series/${currentItem.id}?autoplay=true`
                            )}
                            className="flex items-center gap-3 px-8 py-4 bg-white hover:bg-gray-200 text-black rounded-xl font-bold text-lg transition-all duration-300 transform hover:scale-105 shadow-[0_0_20px_rgba(255,255,255,0.3)] focus:outline-none focus:ring-4 focus:ring-white/50"
                            data-focusable="true"
                            tabIndex={0}
                        >
                            <Play className="w-6 h-6 fill-black" />
                            Assistir
                        </button>

                        <button
                            onClick={() => router.push(currentItem.type === 'movie'
                                ? `/dashboard/watch/movie/${currentItem.id}` // Assuming detail route exists or structure matches
                                : `/dashboard/watch/series/${currentItem.id}`
                            )}
                            className="flex items-center gap-3 px-8 py-4 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white rounded-xl font-bold text-lg transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-white/50"
                            data-focusable="true"
                            tabIndex={0}
                        >
                            <Info className="w-6 h-6" />
                            Mais Info
                        </button>

                        {videoKey && (
                            <button
                                onClick={() => setIsMuted(!isMuted)}
                                className="ml-auto w-12 h-12 flex items-center justify-center rounded-full border border-white/30 bg-black/30 backdrop-blur-sm text-white hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white"
                                data-focusable="true"
                                tabIndex={0}
                            >
                                {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Pagination / Indicators */}
            <div className="absolute right-6 md:right-16 bottom-1/2 transform translate-y-1/2 z-20 flex flex-col gap-4">
                {heroItems.map((_, idx) => (
                    <button
                        key={idx}
                        onClick={() => setCurrentIndex(idx)}
                        className={`w-1 h-12 rounded-full transition-all duration-300 ${idx === currentIndex
                            ? 'bg-white h-16 shadow-[0_0_10px_rgba(255,255,255,0.8)]'
                            : 'bg-white/20 hover:bg-white/40'
                            }`}
                        aria-label={`Go to slide ${idx + 1}`}
                    />
                ))}
            </div>
        </div>
    );
}
