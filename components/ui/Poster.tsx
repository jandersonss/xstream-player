'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Star } from 'lucide-react';
import Badge from './Badge';

export type PosterRatio = 'poster' | 'wide' | 'square';

export interface PosterProps {
    href: string;
    title: string;
    image?: string;
    ratio?: PosterRatio;
    subtitle?: string;
    rating?: number | string;
    year?: number | string;
    badge?: { text: string; tone?: 'neutral' | 'live' | 'ok' | 'warn' };
    /** 0..1. Renders the red progress bar at the bottom of the image. */
    progress?: number;
    className?: string;
    onFocus?: React.FocusEventHandler<HTMLAnchorElement>;
}

const RATIO_CLASSNAME: Record<PosterRatio, string> = {
    poster: 'ratio-poster',
    wide: 'ratio-wide',
    square: 'ratio-square',
};

export default function Poster({
    href,
    title,
    image,
    ratio = 'poster',
    subtitle,
    rating,
    year,
    badge,
    progress,
    className = '',
    onFocus,
}: PosterProps) {
    // Tracked locally: `onError` on <img> only fires once per broken URL, so
    // we swap in a fallback block instead of leaving a hole in the layout.
    const [imageFailed, setImageFailed] = useState(false);
    const showImage = Boolean(image) && !imageFailed;
    const initial = title.trim().charAt(0).toUpperCase() || '?';

    return (
        <Link
            href={href}
            data-focusable="true"
            tabIndex={0}
            onFocus={onFocus}
            className={['spotlight-item focus-lift-lg block rounded-xl', className].join(' ')}
        >
            <div className={['ratio', RATIO_CLASSNAME[ratio], 'rounded-xl overflow-hidden bg-surface-2'].join(' ')}>
                <div className="ratio-fill">
                    {showImage ? (
                        <img
                            src={image}
                            alt={title}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover"
                            onError={() => setImageFailed(true)}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-surface-2">
                            <span className="text-3xl md:text-4xl font-semibold text-ink-3">{initial}</span>
                        </div>
                    )}

                    {badge && (
                        <div className="absolute top-2 left-2">
                            <Badge tone={badge.tone} dot={badge.tone === 'live'}>
                                {badge.text}
                            </Badge>
                        </div>
                    )}

                    {progress !== undefined && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                            <div
                                className="h-full bg-brand"
                                style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
                            />
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-2">
                <p className="text-sm md:text-base font-medium text-ink truncate">{title}</p>
                {subtitle && <p className="text-xs md:text-sm text-ink-2 truncate">{subtitle}</p>}
                {(rating !== undefined || year !== undefined) && (
                    <p className="text-xs md:text-sm text-ink-2 flex items-center tnum">
                        {rating !== undefined && (
                            <span className="flex items-center mr-2">
                                <Star size={12} className="mr-1 text-warn" fill="currentColor" />
                                {rating}
                            </span>
                        )}
                        {year !== undefined && <span>{year}</span>}
                    </p>
                )}
            </div>
        </Link>
    );
}
