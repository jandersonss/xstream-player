'use client';

import React from 'react';

export type BadgeTone = 'neutral' | 'live' | 'ok' | 'warn' | 'rating';

export interface BadgeProps {
    children: React.ReactNode;
    tone?: BadgeTone;
    dot?: boolean;
}

// `live` is the only place outside the logo allowed to use the brand red
// (spec 00 §2.1) — every other tone stays on the neutral/ok/warn scale.
const TONE_CLASSNAME: Record<BadgeTone, string> = {
    neutral: 'bg-surface-2 text-ink-2 border border-line',
    live: 'bg-brand-soft text-brand border border-brand',
    ok: 'bg-surface-2 text-ok border border-line',
    warn: 'bg-surface-2 text-warn border border-line',
    // `rating` borrows the warn hue but is not a warning: the coloured border is
    // what sets a score apart from the neutral facts beside it (type, year).
    rating: 'bg-surface-2 text-warn border border-warn',
};

const DOT_CLASSNAME: Record<BadgeTone, string> = {
    neutral: 'bg-ink-2',
    live: 'bg-brand',
    ok: 'bg-ok',
    warn: 'bg-warn',
    rating: 'bg-warn',
};

export default function Badge({ children, tone = 'neutral', dot = false }: BadgeProps) {
    return (
        <span
            className={[
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                TONE_CLASSNAME[tone],
            ].join(' ')}
        >
            {dot && (
                <span
                    className={['inline-block h-1.5 w-1.5 rounded-full mr-1.5 animate-pulse', DOT_CLASSNAME[tone]].join(' ')}
                />
            )}
            {children}
        </span>
    );
}
