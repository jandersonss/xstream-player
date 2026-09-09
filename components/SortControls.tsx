'use client';

import type { SortOption } from '@/app/lib/catalogSort';
import { useT } from '@/app/context/I18nContext';

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
    const t = useT();
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
                            // (only the colors change) so the active button doesn't
                            // grow and shift its neighbors.
                            'mr-2 mb-2 h-9 px-3 rounded-full text-sm font-medium border-2 transition-colors',
                            // Active pulls up the whole neutral scale at once — fill
                            // (surface-2 -> surface-3), border (line -> line-strong) and
                            // text (ink-2 -> ink) — because a lone border-color swap on a
                            // `border-line` (~8% white) chip is invisible at 3 m.
                            isActive
                                ? 'border-line-strong text-ink bg-surface-3'
                                : 'border-line text-ink-2 bg-surface-2',
                        ].join(' ')}
                    >
                        {t(`catalog.sort.${option}`)}
                    </button>
                );
            })}
        </div>
    );
}
