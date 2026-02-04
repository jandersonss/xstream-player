'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface UseInfiniteScrollOptions {
    initialBatchSize?: number;
    loadBatchSize?: number;
    threshold?: number;
}

export function useInfiniteScroll<T>(
    items: T[],
    {
        initialBatchSize = 40,
        loadBatchSize = 20,
        threshold = 0.1
    }: UseInfiniteScrollOptions = {}
) {
    const [visibleCount, setVisibleCount] = useState(initialBatchSize);
    const sentinelRef = useRef<HTMLDivElement | null>(null);

    // Reset visible count when items change (e.g. after search or sort)
    useEffect(() => {
        setVisibleCount(initialBatchSize);
    }, [items, initialBatchSize]);

    const loadMore = useCallback(() => {
        setVisibleCount((prev) => Math.min(prev + loadBatchSize, items.length));
    }, [loadBatchSize, items.length]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    loadMore();
                }
            },
            { threshold }
        );

        const currentSentinel = sentinelRef.current;
        if (currentSentinel) {
            observer.observe(currentSentinel);
        }

        return () => {
            if (currentSentinel) {
                observer.unobserve(currentSentinel);
            }
        };
    }, [loadMore, threshold]);

    const visibleItems = items.slice(0, visibleCount);
    const hasMore = visibleCount < items.length;

    return {
        visibleItems,
        hasMore,
        sentinelRef
    };
}
