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

    const [prevItems, setPrevItems] = useState(items);

    // Reset visible count when items change (e.g. after search or sort). Done during
    // render so the first paint of the new list already uses the reset count.
    if (items !== prevItems) {
        setPrevItems(items);
        setVisibleCount(initialBatchSize);
    }

    const loadMore = useCallback(() => {
        setVisibleCount((prev) => Math.min(prev + loadBatchSize, items.length));
    }, [loadBatchSize, items.length]);

    // Re-observing after each batch makes the observer fire again when the sentinel is
    // still on screen (tall viewports/TVs), since it only reports intersection transitions.
    useEffect(() => {
        const currentSentinel = sentinelRef.current;
        if (!currentSentinel) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    loadMore();
                }
            },
            { threshold }
        );
        observer.observe(currentSentinel);

        return () => observer.disconnect();
    }, [loadMore, threshold, visibleCount]);

    const visibleItems = items.slice(0, visibleCount);
    const hasMore = visibleCount < items.length;

    return {
        visibleItems,
        hasMore,
        sentinelRef
    };
}
