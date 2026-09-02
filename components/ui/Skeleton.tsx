'use client';

import React from 'react';
import Row from './Row';

export interface SkeletonProps {
    className?: string;
}

export default function Skeleton({ className = '' }: SkeletonProps) {
    return <div className={['animate-pulse bg-surface-2 rounded-lg', className].join(' ')} />;
}

const SKELETON_ROW_ITEM_COUNT = 6;

const SKELETON_RATIO_CLASSNAME: Record<'poster' | 'wide', string> = {
    poster: 'ratio-poster',
    wide: 'ratio-wide',
};

/** Placeholder row shown while a real content row is loading. */
export function SkeletonRow({ itemWidth = 'poster' }: { itemWidth?: 'poster' | 'wide' }) {
    return (
        <Row title="" itemWidth={itemWidth}>
            {Array.from({ length: SKELETON_ROW_ITEM_COUNT }, (_, i) => (
                <div key={i} className={['ratio', SKELETON_RATIO_CLASSNAME[itemWidth], 'rounded-xl overflow-hidden'].join(' ')}>
                    <Skeleton className="ratio-fill" />
                </div>
            ))}
        </Row>
    );
}
