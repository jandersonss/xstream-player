'use client';

import React, { useState } from 'react';
import { AlertTriangle, Loader2, Pause, Play } from 'lucide-react';
import { useT } from '@/app/context/I18nContext';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';

// The diagnostics page is a plain static HTML/JS checklist (public/debug/index.html)
// designed to run even on browsers too old for this React app — see the comment in
// app/debug/page.tsx. It is loaded here through an iframe instead of being
// reimplemented in React so the checklist logic keeps a single source of truth.
const DEBUG_PATH = '/debug/index.html';

export interface PlayerOverlaysProps {
    isBuffering: boolean;
    /** Shown after 15s of uninterrupted buffering (inventory item 38). */
    showBufferingHelp: boolean;
    centerPlayPause: { show: boolean; playing: boolean };
    skipIndicator: { show: boolean; text: string };
    error: string;
}

export default function PlayerOverlays({ isBuffering, showBufferingHelp, centerPlayPause, skipIndicator, error }: PlayerOverlaysProps) {
    const t = useT();
    const [showDiagnostics, setShowDiagnostics] = useState(false);

    return (
        <>
            {isBuffering && (
                <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
                    <div className="bg-black/70 rounded-xl p-6 shadow-2xl text-center max-w-sm mx-4">
                        <Loader2 className="w-12 h-12 text-brand animate-spin mx-auto" />
                        {showBufferingHelp && (
                            <div className="mt-4 text-ink text-sm pointer-events-auto">
                                <p className="mb-2">{t('player.loadingSlow')}</p>
                                <button
                                    type="button"
                                    onClick={() => setShowDiagnostics(true)}
                                    data-focusable="true"
                                    tabIndex={0}
                                    className="text-ink-2 underline font-semibold"
                                >
                                    {t('common.openDiagnostics')}
                                </button>
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
                                onClick={() => setShowDiagnostics(true)}
                            >
                                {t('common.openDiagnostics')}
                            </Button>
                        }
                    />
                </div>
            )}

            <Modal
                isOpen={showDiagnostics}
                onClose={() => setShowDiagnostics(false)}
                title={t('common.diagnosticsTitle')}
                size="lg"
            >
                <iframe
                    src={DEBUG_PATH}
                    title={t('common.diagnosticsTitle')}
                    data-focusable="true"
                    tabIndex={0}
                    className="w-full h-[70vh] rounded-lg border border-line bg-black"
                />
            </Modal>
        </>
    );
}
