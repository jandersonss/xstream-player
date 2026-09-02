'use client';

import { SORT_LABELS } from '@/app/lib/catalogSort';
import type { SortOption } from '@/app/lib/catalogSort';

// Re-exported so existing consumers (e.g. `useSortPreference`) that import the
// type from this file keep working without reaching into `catalogSort` directly.
export type { SortOption };

export interface SortControlsProps {
    value: SortOption;
    onChange: (next: SortOption) => void;
    /** The caller decides which options exist (categories only sort by name). */
    options: SortOption[];
}

export default function SortControls({ value, onChange, options }: SortControlsProps) {
    // `mr-2 mb-2` on each button emulates flex spacing without the `gap` utility (Chrome 84+, unavailable on webOS 4).
    return (
        <div className="flex flex-wrap items-center">
            {options.map((option) => {
                const isActive = option === value;
                return (
                    <button
                        key={option}
                        type="button"
                        onClick={() => onChange(option)}
                        data-focusable="true"
                        tabIndex={0}
                        className={[
                            'mr-2 mb-2 h-9 px-3 rounded-lg text-sm font-medium transition-colors',
                            isActive ? 'bg-surface-3 text-ink' : 'text-ink-2 border border-line',
                        ].join(' ')}
                    >
                        {SORT_LABELS[option]}
                    </button>
                );
            })}
        </div>
    );
}
