'use client';

import React from 'react';
import { Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward, Subtitles } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import IconButton from '@/components/ui/IconButton';
import SeekBar, { type SeekBarProps } from './SeekBar';
import VolumeControl, { type VolumeControlProps } from './VolumeControl';

export interface PlayerControlsProps {
    isPlaying: boolean;
    onTogglePlay: () => void;
    onSkip: (seconds: number) => void;
    onPrevious?: () => void;
    onNext?: () => void;
    hasPrevious: boolean;
    hasNext: boolean;
    isLive: boolean;
    currentTime: number;
    duration: number;
    subtitlesAvailable: boolean;
    subtitlesEnabled: boolean;
    onToggleSubtitles: () => void;
    subtitleFontSize: number;
    onChangeFontSize: (delta: number) => void;
    isFullscreen: boolean;
    onToggleFullscreen: () => void;
    seek: SeekBarProps;
    volume: VolumeControlProps;
}

// Mirrors the formatter that lived inline in VideoPlayer — this component
// receives raw seconds (not a preformatted string), so it needs its own copy.
function formatTime(time: number): string {
    if (isNaN(time)) return '00:00';
    const h = Math.floor(time / 3600);
    const m = Math.floor((time % 3600) / 60);
    const s = Math.floor(time % 60);
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function PlayerControls({
    isPlaying,
    onTogglePlay,
    onSkip,
    onPrevious,
    onNext,
    hasPrevious,
    hasNext,
    isLive,
    currentTime,
    duration,
    subtitlesAvailable,
    subtitlesEnabled,
    onToggleSubtitles,
    onChangeFontSize,
    isFullscreen,
    onToggleFullscreen,
    seek,
    volume,
}: PlayerControlsProps) {
    // D10 fix: only render when the callback exists AND the prop says there is
    // somewhere to go — the old code always evaluated the has-next/has-previous
    // check as true, which made those props inert.
    const showPrevious = Boolean(onPrevious) && hasPrevious;
    const showNext = Boolean(onNext) && hasNext;
    const showFontSizeControls = subtitlesAvailable && subtitlesEnabled;

    return (
        <div
            data-player-controls="true"
            className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/95 via-black/70 to-transparent px-4 py-2"
        >
            <SeekBar {...seek} />

            <div className="flex items-center justify-between space-x-2">
                <div className="flex items-center space-x-2">
                    {showPrevious && (
                        <IconButton icon={SkipBack} label="Episódio anterior" onClick={onPrevious} className="focus-flat" />
                    )}

                    <IconButton icon={RotateCcw} label="Voltar 10 segundos" onClick={() => onSkip(-10)} className="focus-flat" />

                    <IconButton
                        icon={isPlaying ? Pause : Play}
                        label={isPlaying ? 'Pausar' : 'Reproduzir'}
                        onClick={onTogglePlay}
                        size="lg"
                        className="focus-flat"
                    />

                    <IconButton icon={RotateCw} label="Avançar 10 segundos" onClick={() => onSkip(10)} className="focus-flat" />

                    {showNext && (
                        <IconButton icon={SkipForward} label="Próximo episódio" onClick={onNext} className="focus-flat" />
                    )}

                    {!isLive && (
                        <div className="tnum flex items-center space-x-1.5 px-2 text-sm text-ink-2 whitespace-nowrap">
                            <span className="text-ink">{formatTime(currentTime)}</span>
                            <span className="opacity-40">/</span>
                            <span>{formatTime(duration)}</span>
                        </div>
                    )}

                    <VolumeControl {...volume} />

                    {isLive && (
                        <div className="ml-2">
                            <Badge tone="live" dot>Ao vivo</Badge>
                        </div>
                    )}
                </div>

                <div className="flex items-center space-x-2">
                    {showFontSizeControls && (
                        <div className="flex items-center space-x-1 bg-surface-2 rounded-lg px-2 py-1">
                            <button
                                type="button"
                                onClick={() => onChangeFontSize(-0.1)}
                                data-focusable="true"
                                className="focus-flat text-ink-2 hover:text-ink p-1 transition-colors text-xs font-bold"
                                title="Diminuir fonte ( [ )"
                                aria-label="Diminuir fonte da legenda"
                            >
                                A-
                            </button>
                            <div className="w-px h-3 bg-line mx-1" />
                            <button
                                type="button"
                                onClick={() => onChangeFontSize(0.1)}
                                data-focusable="true"
                                className="focus-flat text-ink-2 hover:text-ink p-1 transition-colors text-sm font-bold"
                                title="Aumentar fonte ( ] )"
                                aria-label="Aumentar fonte da legenda"
                            >
                                A+
                            </button>
                        </div>
                    )}

                    {subtitlesAvailable && (
                        <IconButton
                            icon={Subtitles}
                            label={subtitlesEnabled ? 'Desativar legendas' : 'Ativar legendas'}
                            onClick={onToggleSubtitles}
                            active={subtitlesEnabled}
                            className="focus-flat"
                        />
                    )}

                    <IconButton
                        icon={isFullscreen ? Minimize : Maximize}
                        label={isFullscreen ? 'Sair do modo tela cheia' : 'Modo tela cheia'}
                        onClick={onToggleFullscreen}
                        className="focus-flat"
                    />
                </div>
            </div>
        </div>
    );
}
