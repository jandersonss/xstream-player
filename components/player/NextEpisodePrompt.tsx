'use client';

import React, { type RefObject } from 'react';
import { SkipForward } from 'lucide-react';

export interface NextEpisodePromptProps {
    visible: boolean;
    /** Progress towards the automatic skip, 0..1. */
    autoSkipProgress: number;
    /** Whole seconds left before the automatic skip fires. */
    secondsLeft: number;
    onNext?: () => void;
    onPostpone: () => void;
    /** Arrow-key navigation between the two buttons stays in VideoPlayer.tsx — these are just forwarded refs. */
    promptRef: RefObject<HTMLDivElement | null>;
    nextButtonRef: RefObject<HTMLButtonElement | null>;
    postponeButtonRef: RefObject<HTMLButtonElement | null>;
}

export default function NextEpisodePrompt({
    visible,
    autoSkipProgress,
    secondsLeft,
    onNext,
    onPostpone,
    promptRef,
    nextButtonRef,
    postponeButtonRef,
}: NextEpisodePromptProps) {
    if (!visible) return null;

    return (
        <div
            ref={promptRef}
            // Opaque background instead of a blurred one: the CSS backdrop
            // filter is inert below Chrome 76 and the target floor is
            // Chromium 53 (spec 05 §4).
            className="absolute bottom-24 right-6 z-20 flex items-center space-x-1 rounded-xl border border-line bg-black/90 p-1.5 shadow-2xl"
        >
            <button
                ref={nextButtonRef}
                type="button"
                onClick={onNext}
                data-focusable="true"
                className="focus-flat relative flex items-center space-x-2 overflow-hidden rounded-md bg-surface-2 px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-3"
                aria-label="Pular para o próximo episódio"
            >
                <SkipForward size={16} aria-hidden="true" />
                <span>Próximo episódio</span>
                <span className="tnum text-xs text-ink-2" aria-hidden="true">{secondsLeft}s</span>
                <span
                    className="absolute bottom-0 left-0 h-0.5 bg-ink transition-[width] duration-300 ease-linear"
                    style={{ width: `${autoSkipProgress * 100}%` }}
                    aria-hidden="true"
                />
            </button>
            <button
                ref={postponeButtonRef}
                type="button"
                onClick={onPostpone}
                data-focusable="true"
                className="focus-flat rounded-md px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
            >
                Adiar 1 min
            </button>
        </div>
    );
}
