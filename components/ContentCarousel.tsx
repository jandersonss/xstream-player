'use client';

import Link from 'next/link';
import { Play, ChevronRight } from 'lucide-react';
import { LucideIcon } from 'lucide-react';

interface CarouselItem {
    id: string | number;
    name: string;
    image: string;
    rating?: string | number;
    year?: string | number;
    progress?: number;
    duration?: number;
    href?: string;
}

interface ContentCarouselProps {
    title: string;
    items: CarouselItem[];
    icon?: LucideIcon;
    onViewAll?: () => void;
    showProgress?: boolean;
}

export default function ContentCarousel({
    title,
    items,
    icon: Icon,
    onViewAll,
    showProgress = false
}: ContentCarouselProps) {
    if (items.length === 0) return null;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    {Icon && <Icon size={20} className="text-red-500" />}
                    {title}
                </h2>
                {onViewAll && (
                    <button
                        onClick={onViewAll}
                        className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors group"
                    >
                        Ver Todos
                        <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                )}
            </div>

            <div className="relative">
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent hover:scrollbar-thumb-white/20">
                    {items.map((item) => (
                        <Link
                            key={`${item.name}-${item.id}`}
                            href={item.href || '#'}
                            data-focusable="true"
                            className="group relative flex-shrink-0 w-[200px] aspect-[2/3] rounded-xl overflow-hidden border border-white/10 hover:border-red-600 transition-all focus:outline-none focus:ring-4 focus:ring-red-600 focus:scale-105"
                        >
                            <img
                                src={item.image}
                                alt={item.name}
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent"></div>

                            {/* Play button overlay */}
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="bg-red-600 p-3 rounded-full shadow-xl">
                                    <Play size={24} fill="currentColor" className="text-white" />
                                </div>
                            </div>

                            {/* Content info */}
                            <div className="absolute bottom-0 left-0 w-full p-3">
                                <p className="text-white text-sm font-bold truncate mb-1">{item.name}</p>

                                {/* Rating or Year */}
                                {(item.rating || item.year) && (
                                    <div className="flex items-center gap-2 text-xs text-gray-300 mb-1">
                                        {item.rating && (
                                            <span className="flex items-center gap-1">
                                                ⭐ {typeof item.rating === 'number' ? item.rating.toFixed(1) : item.rating}
                                            </span>
                                        )}
                                        {item.year && <span>{item.year}</span>}
                                    </div>
                                )}

                                {/* Progress bar */}
                                {showProgress && item.progress !== undefined && item.duration !== undefined && (
                                    <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-red-600"
                                            style={{ width: `${Math.min(100, (item.progress / item.duration) * 100)}%` }}
                                        ></div>
                                    </div>
                                )}
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
