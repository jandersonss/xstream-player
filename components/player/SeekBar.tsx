'use client';

import React, { useState } from 'react';

export interface SeekBarProps {
    currentTime: number;
    duration: number;
    bufferedPercent: number;
    /** True when the stream is live and has no broadcast timeline to scrub through. */
    disabled: boolean;
    onSeek: (seconds: number) => void;
    onSeekStart: () => void;
    onSeekEnd: () => void;
}

export default function SeekBar({ currentTime, duration, bufferedPercent, disabled, onSeek, onSeekStart, onSeekEnd }: SeekBarProps) {
    // The track thickens on focus so it stays legible from a couch without
    // being visually noisy the rest of the time.
    const [focused, setFocused] = useState(false);

    return (
        <div className="mb-1">
            <div className={`relative flex items-center transition-all duration-150 ${focused ? 'h-1.5' : 'h-1'}`}>
                <div className="absolute inset-0 bg-surface-2 rounded-full" />

                <div
                    className="absolute inset-y-0 left-0 bg-line-strong rounded-full transition-all duration-300"
                    style={{ width: `${Number.isFinite(bufferedPercent) ? bufferedPercent : 0}%` }}
                    aria-hidden
                />

                {!disabled && (
                    <>
                        {/* Third and last legitimate use of the brand red (spec 05 §4). */}
                        <div
                            className="absolute inset-y-0 left-0 bg-brand rounded-full pointer-events-none z-[1]"
                            style={{ width: `${duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0}%` }}
                            aria-hidden
                        />

                        <input
                            type="range"
                            min={0}
                            max={duration || 0}
                            value={currentTime}
                            onChange={(e) => onSeek(parseFloat(e.target.value))}
                            onMouseDown={onSeekStart}
                            onMouseUp={onSeekEnd}
                            onFocus={() => setFocused(true)}
                            onBlur={() => setFocused(false)}
                            data-focusable="true"
                            className="focus-flat absolute inset-0 w-full bg-transparent appearance-none cursor-pointer z-10
                            [&::-webkit-slider-runnable-track]:bg-transparent
                            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
                            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink
                            [&::-webkit-slider-thumb]:cursor-pointer
                            [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5
                            [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-ink
                            [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-none"
                            aria-label="Progresso do vídeo"
                        />
                    </>
                )}
            </div>
        </div>
    );
}
