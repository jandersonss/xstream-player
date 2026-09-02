'use client';

import { Radio } from 'lucide-react';

export interface BroadcastToggleProps {
    active: boolean;
    onToggle: () => void;
    /** Disables the toggle while the relay is not ready yet. */
    disabled?: boolean;
}

/**
 * "Transmitir" pill used by the three watch screens (live/movie/series) to start or
 * stop a Modo TV broadcast. Consolidates three near-identical local implementations
 * (spec 07 §3) — the badge-style "no ar" look when active is one of the few legitimate
 * uses of the brand red (spec 00 §2.1).
 */
export default function BroadcastToggle({ active, onToggle, disabled = false }: BroadcastToggleProps) {
    return (
        <button
            onClick={onToggle}
            disabled={disabled}
            data-focusable={disabled ? undefined : 'true'}
            tabIndex={disabled ? undefined : 0}
            className={[
                'flex items-center space-x-2 h-10 px-4 rounded-full text-sm font-semibold transition-colors',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                active ? 'bg-brand text-ink' : 'bg-surface-2 text-ink-2 border border-line',
            ].join(' ')}
            title={active ? 'Transmitindo para o Modo TV' : 'Transmitir no Modo TV'}
        >
            <Radio size={18} className={active ? 'animate-pulse' : ''} />
            <span>{active ? 'Transmitindo' : 'Transmitir'}</span>
        </button>
    );
}
