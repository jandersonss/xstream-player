'use client';

import { useState, useEffect } from 'react';
import { SortOption } from '@/components/SortControls';

export function useSortPreference(key: string, defaultValue: SortOption = 'added') {
    // Initial state set to defaultValue, will be updated by useEffect on mount
    const [sort, setSort] = useState<SortOption>(defaultValue);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(`xstream_sort_${key}`);
            if (saved) {
                setSort(saved as SortOption);
            }
            setIsLoaded(true);
        }
    }, [key]);

    const updateSort = (newSort: SortOption) => {
        setSort(newSort);
        if (typeof window !== 'undefined') {
            localStorage.setItem(`xstream_sort_${key}`, newSort);
        }
    };

    return [sort, updateSort, isLoaded] as const;
}
