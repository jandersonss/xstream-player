'use client';

import React from 'react';

export interface ToggleProps {
    checked: boolean;
    onChange: (next: boolean) => void;
    label: string;
    description?: string;
    disabled?: boolean;
}

export default function Toggle({ checked, onChange, label, description, disabled = false }: ToggleProps) {
    return (
        <div className="flex items-center justify-between">
            <div className="mr-4">
                <p className="text-sm md:text-base text-ink">{label}</p>
                {description && <p className="text-xs md:text-sm text-ink-2 mt-0.5">{description}</p>}
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={label}
                disabled={disabled}
                data-focusable={disabled ? undefined : 'true'}
                tabIndex={disabled ? undefined : 0}
                onClick={() => onChange(!checked)}
                className={[
                    'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors',
                    'disabled:opacity-40 disabled:cursor-not-allowed',
                    // State is carried by position AND color — color alone fails at 3m.
                    checked ? 'bg-ok' : 'bg-surface-3',
                ].join(' ')}
            >
                <span
                    className={[
                        'inline-block h-4 w-4 transform rounded-full bg-ink transition-transform',
                        checked ? 'translate-x-6' : 'translate-x-1',
                    ].join(' ')}
                />
            </button>
        </div>
    );
}
