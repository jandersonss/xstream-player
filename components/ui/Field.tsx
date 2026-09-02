'use client';

import React from 'react';

export interface FieldProps {
    label: string;
    htmlFor?: string;
    error?: string;
    hint?: string;
    children: React.ReactNode;
}

/** Shared class string for inputs, so it isn't repeated across 12 forms. */
export const inputClassName =
    'w-full h-11 px-3 rounded-lg bg-surface border border-line text-ink placeholder:text-ink-3 text-sm md:text-base';

export default function Field({ label, htmlFor, error, hint, children }: FieldProps) {
    return (
        <div>
            <label htmlFor={htmlFor} className="block text-sm text-ink-2 mb-1.5">
                {label}
            </label>
            {children}
            {error ? (
                <p className="text-xs text-brand mt-1.5">{error}</p>
            ) : hint ? (
                <p className="text-xs text-ink-3 mt-1.5">{hint}</p>
            ) : null}
        </div>
    );
}
