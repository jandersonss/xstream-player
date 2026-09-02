'use client';

import React from 'react';
import { AlertTriangle, Loader2, Pause, Play } from 'lucide-react';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';

const DEBUG_PATH = '/debug';

export interface PlayerOverlaysProps {
    isBuffering: boolean;
    /** Shown after 15s of uninterrupted buffering (inventory item 38). */
    showBufferingHelp: boolean;
    centerPlayPause: { show: boolean; playing: boolean };
    skipIndicator: { show: boolean; text: string };
    error: string;
}

export default function PlayerOverlays({ isBuffering, showBufferingHelp, centerPlayPause, skipIndicator, error }: PlayerOverlaysProps) {
    return (
        <>
            {isBuffering && (
                <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
                    <div className="bg-black/70 rounded-xl p-6 shadow-2xl text-center max-w-sm mx-4">
                        <Loader2 className="w-12 h-12 text-brand animate-spin mx-auto" />
                        {showBufferingHelp && (
                            <div className="mt-4 text-ink text-sm pointer-events-auto">
                                <p className="mb-2">O carregamento está demorando.</p>
                                <a
                                    href={DEBUG_PATH}
                                    data-focusable="true"
                                    tabIndex={0}
                                    className="text-ink-2 underline font-semibold"
                                >
                                    Abrir diagnóstico
                                </a>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {centerPlayPause.show && (
                <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                    <div className="bg-black/70 rounded-full p-8 shadow-2xl">
                        {centerPlayPause.playing ? (
                            <Play size={64} fill="currentColor" className="text-ink" />
                        ) : (
                            <Pause size={64} fill="currentColor" className="text-ink" />
                        )}
                    </div>
                </div>
            )}

            {skipIndicator.show && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
                    <div className="bg-black/80 rounded-xl px-8 py-4 shadow-2xl">
                        <p className="text-ink text-3xl font-bold">{skipIndicator.text}</p>
                    </div>
                </div>
            )}

            {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-30">
                    <EmptyState
                        icon={AlertTriangle}
                        title={error}
                        action={
                            <Button
                                variant="secondary"
                                onClick={() => { window.location.href = DEBUG_PATH; }}
                            >
                                Abrir diagnóstico
                            </Button>
                        }
                    />
                </div>
            )}
        </>
    );
}
