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
                        onClick={() => onChange(option)}
                        data-focusable="true"
                        tabIndex={0}
                        aria-pressed={isActive}
                        className={[
                            // `rounded-full` matches the other chip-style controls
                            // (search tabs, home shortcuts). `border-2` on both states
                            // (only the color changes) so the active button doesn't
                            // grow and shift its neighbors.
                            'mr-2 mb-2 h-9 px-3 rounded-full text-sm font-medium border-2 transition-colors',
                            isActive ? 'border-ink text-ink bg-surface-2' : 'border-line text-ink-2 bg-surface-2',
                        ].join(' ')}
                    >
                        {SORT_LABELS[option]}
                    </button>
                );
            })}
        </div>
    );
}
