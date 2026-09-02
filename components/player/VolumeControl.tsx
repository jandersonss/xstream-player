'use client';

import React, { useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import IconButton from '@/components/ui/IconButton';

export interface VolumeControlProps {
    volume: number;
    muted: boolean;
    onToggleMute: () => void;
    onVolumeChange: (next: number) => void;
}

export default function VolumeControl({ volume, muted, onToggleMute, onVolumeChange }: VolumeControlProps) {
    // Visible on hover (desktop) or while the button/slider itself holds focus
    // (D-pad) — no longer hover-only, which made it unreachable on a TV (D6).
    const [visible, setVisible] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const volumePercent = Math.round(volume * 100);

    const handleBlur = (e: React.FocusEvent) => {
        const next = e.relatedTarget as Node | null;
        if (!next || !containerRef.current?.contains(next)) {
            setVisible(false);
        }
    };

    // The slider is rendered vertically, but useTvNavigation treats ArrowUp/
    // ArrowDown as page navigation for every form control (it only exempts
    // ArrowLeft/ArrowRight on a range input) — so those keys would otherwise
    // move focus off the slider instead of raising/lowering the volume.
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        e.stopPropagation();
        const step = 0.05;
        const delta = e.key === 'ArrowUp' ? step : -step;
        onVolumeChange(Math.min(1, Math.max(0, volume + delta)));
    };

    return (
        <div
            ref={containerRef}
            className="relative ml-2"
            onMouseEnter={() => setVisible(true)}
            onMouseLeave={() => setVisible(false)}
        >
            <IconButton
                icon={muted || volume === 0 ? VolumeX : Volume2}
                label={muted ? 'Ativar som' : 'Silenciar'}
                onClick={onToggleMute}
                onFocus={() => setVisible(true)}
                onBlur={handleBlur}
                className="focus-flat"
            />

            {visible && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-black/80 rounded-xl p-3 shadow-2xl">
                    <div className="flex flex-col items-center space-y-2">
                        <span className="tnum text-ink text-xs font-medium">{volumePercent}%</span>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={volume}
                            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                            onKeyDown={handleKeyDown}
                            onFocus={() => setVisible(true)}
                            onBlur={handleBlur}
                            data-focusable="true"
                            className="focus-flat h-24 w-2 appearance-none bg-surface-2 rounded-full cursor-pointer
                            [writing-mode:bt-lr] [-webkit-appearance:slider-vertical]
                            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
                            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink
                            [&::-webkit-slider-thumb]:cursor-pointer
                            [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5
                            [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-ink
                            [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-none"
                            aria-label="Controle de volume"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
