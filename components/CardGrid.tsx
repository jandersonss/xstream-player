'use client';

import React from 'react';

/**
 * Number of columns a breakpoint may ask for.
 */
export type CardGridColumns = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Spacing between cards, on the Tailwind scale (matches the old `gap-4` / `gap-6`).
 */
export type CardGridGap = 4 | 6;

// Widths are spelled out as arbitrary percentages instead of `w-1/3` / `w-1/6`:
// Tailwind rounds those up (33.333333%, 16.666667%), and on a wrapping flex line
// the sum can land just past 100% and push the last card to the next row. CSS grid
// never had that risk because `grid-cols-*` uses `minmax(0, 1fr)`.
const BASE_WIDTH: Record<CardGridColumns, string> = {
    1: 'w-full',
    2: 'w-[50%]',
    3: 'w-[33.3333%]',
    4: 'w-[25%]',
    5: 'w-[20%]',
    6: 'w-[16.6666%]',
};

// Every breakpoint needs its own literal class strings — Tailwind scans the source
// for complete class names and would not see them if they were built at runtime.
const SM_WIDTH: Record<CardGridColumns, string> = {
    1: 'sm:w-full',
    2: 'sm:w-[50%]',
    3: 'sm:w-[33.3333%]',
    4: 'sm:w-[25%]',
    5: 'sm:w-[20%]',
    6: 'sm:w-[16.6666%]',
};

const MD_WIDTH: Record<CardGridColumns, string> = {
    1: 'md:w-full',
    2: 'md:w-[50%]',
    3: 'md:w-[33.3333%]',
    4: 'md:w-[25%]',
    5: 'md:w-[20%]',
    6: 'md:w-[16.6666%]',
};

const LG_WIDTH: Record<CardGridColumns, string> = {
    1: 'lg:w-full',
    2: 'lg:w-[50%]',
    3: 'lg:w-[33.3333%]',
    4: 'lg:w-[25%]',
    5: 'lg:w-[20%]',
    6: 'lg:w-[16.6666%]',
};

const XL_WIDTH: Record<CardGridColumns, string> = {
    1: 'xl:w-full',
    2: 'xl:w-[50%]',
    3: 'xl:w-[33.3333%]',
    4: 'xl:w-[25%]',
    5: 'xl:w-[20%]',
    6: 'xl:w-[16.6666%]',
};

// The container pulls in by half the gap and every cell pads out by the same half,
// so the space between two cards adds up to the full gap and the outer edges stay
// flush with the surrounding content — exactly what `gap-*` produced.
const CONTAINER_OFFSET: Record<CardGridGap, string> = {
    4: '-m-2',
    6: '-m-3',
};

const CELL_PADDING: Record<CardGridGap, string> = {
    4: 'p-2',
    6: 'p-3',
};

export interface CardGridProps {
    /** Columns at the base (mobile) breakpoint. */
    base: CardGridColumns;
    sm?: CardGridColumns;
    md?: CardGridColumns;
    lg?: CardGridColumns;
    xl?: CardGridColumns;
    /** Defaults to 6, the most common card spacing in the app. */
    gap?: CardGridGap;
    children: React.ReactNode;
}

/**
 * Responsive card grid built on wrapping flexbox instead of CSS grid.
 *
 * WebOS TVs run Chromium 53, which has neither CSS grid (Chrome 57+) nor flex `gap`
 * (Chrome 84+), so a `grid grid-cols-* gap-*` container renders as a single stacked
 * column there. Percentage-width cells plus the negative-margin gutter trick produce
 * the identical layout on every browser the app targets.
 */
export default function CardGrid({ base, sm, md, lg, xl, gap = 6, children }: CardGridProps) {
    // `flex` + `[&>*]:w-full` on the cell reproduces what grid items did for free:
    // the card fills its cell horizontally and stretches to the tallest card in the
    // row. `min-w-0` stands in for the `minmax(0, 1fr)` of `grid-cols-*`, so a card
    // with truncated text cannot push its cell past the intended column width.
    const cellClassName = [
        CELL_PADDING[gap],
        'flex min-w-0 [&>*]:w-full',
        BASE_WIDTH[base],
        sm ? SM_WIDTH[sm] : null,
        md ? MD_WIDTH[md] : null,
        lg ? LG_WIDTH[lg] : null,
        xl ? XL_WIDTH[xl] : null,
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div className={`flex flex-wrap ${CONTAINER_OFFSET[gap]}`}>
            {React.Children.map(children, (child) =>
                child === null || child === undefined || typeof child === 'boolean' ? null : (
                    <div className={cellClassName}>{child}</div>
                )
            )}
        </div>
    );
}
