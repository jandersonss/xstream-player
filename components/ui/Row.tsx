'use client';

import React from 'react';
import { ChevronRight } from 'lucide-react';
import { scrollIntoViewSafe } from '@/app/lib/platform/scroll';

export interface RowProps {
    title: string;
    viewAllLabel?: string;
    onViewAll?: () => void;
    children: React.ReactNode;
    itemWidth?: 'poster' | 'wide';
}

const ITEM_WIDTH_CLASSNAME: Record<'poster' | 'wide', string> = {
    poster: 'w-[42%] sm:w-[30%] md:w-[22%] lg:w-[17%] xl:w-[14%]',
    wide: 'w-[72%] sm:w-[46%] md:w-[34%] lg:w-[26%] xl:w-[21%]',
};

export default function Row({
    title,
    viewAllLabel = 'Ver todos',
    onViewAll,
    children,
    itemWidth = 'poster',
}: RowProps) {
    // Arrow keys are deliberately NOT handled here. The focusable elements are
    // the children, not this container, so `useTvNavigation` owns horizontal
    // movement: it walks focus from one item to the next. Intercepting the keys
    // to scroll instead would pin focus on the first item forever — the list
    // would slide under a cursor that never moves. `data-carousel` is likewise
    // omitted: useTvNavigation reads it off document.activeElement, which is a
    // child here, so it would never match.
    const handleFocusCapture = (e: React.FocusEvent<HTMLDivElement>) => {
        // Keeps the newly focused item centred instead of flush against the edge.
        scrollIntoViewSafe(e.target);
    };

    const itemClassName = ['flex-shrink-0 mr-3 md:mr-4', ITEM_WIDTH_CLASSNAME[itemWidth]].join(' ');

    return (
        <div>
            <div className="flex items-center justify-between mb-3 px-1">
                <h2 className="text-lg md:text-xl font-semibold text-ink">{title}</h2>
                {onViewAll && (
                    <button
                        type="button"
                        onClick={onViewAll}
                        data-focusable="true"
                        tabIndex={0}
                        className="flex items-center text-sm text-ink-2 hover:text-ink"
                    >
                        {viewAllLabel}
                        <ChevronRight size={16} className="ml-1" />
                    </button>
                )}
            </div>

            <div className="row-scroller flex" onFocusCapture={handleFocusCapture}>
                {React.Children.map(children, (child) =>
                    child === null || child === undefined || typeof child === 'boolean' ? null : (
                        <div className={itemClassName}>{child}</div>
                    )
                )}
            </div>
        </div>
    );
}
