'use client';

import { useState } from 'react';
import { Radio, Play, RotateCcw, Minus, Plus } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';

interface BroadcastStartModalProps {
    /** Saved progress for this content (seconds); 0 when there is none. */
    resumeTime: number;
    /** Total duration (seconds), when known — caps the selectable point. */
    duration?: number;
    onCancel: () => void;
    onConfirm: (startSeconds: number) => void;
}

/** Keeps the last selectable second away from the very end (nothing left to broadcast). */
const END_MARGIN_S = 60;

function formatTime(total: number): string {
    const s = Math.max(0, Math.floor(total));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/**
 * Asks where the TV Mode broadcast should start. The chosen point is baked into the
 * ffmpeg process, so it can only be picked when the broadcast is created — that is
 * why this appears before sharing is turned on, and never while it is running.
 *
 * Mount it only while it should be visible: the initial pick is seeded from the saved
 * progress, and unmounting is what discards a previous pick. It stays uncontrolled on
 * purpose — turning it into an always-mounted modal would keep a stale `seconds` pick
 * around for the next broadcast.
 */
export default function BroadcastStartModal({
    resumeTime,
    duration,
    onCancel,
    onConfirm,
}: BroadcastStartModalProps) {
    const maxSeconds = duration && duration > END_MARGIN_S ? duration - END_MARGIN_S : undefined;
    const [seconds, setSeconds] = useState(() => (resumeTime > 0 ? Math.floor(resumeTime) : 0));

    const clampSeconds = (value: number) => {
        const floored = Math.max(0, Math.floor(value));
        return maxSeconds !== undefined ? Math.min(floored, Math.floor(maxSeconds)) : floored;
    };
    const step = (deltaMinutes: number) => setSeconds((s) => clampSeconds(s + deltaMinutes * 60));

    const hasResume = resumeTime > 0;
    const isAtStart = seconds === 0;
    const isAtResume = hasResume && seconds === Math.floor(resumeTime);

    const optionClassName = (active: boolean) =>
        active ? 'border-line-strong' : '';

    return (
        <Modal
            isOpen
            onClose={onCancel}
            title="De onde começar a transmitir"
            description="Quem entrar depois pega a transmissão no ponto em que ela estiver, como um canal."
            size="sm"
            footer={
                <div className="flex justify-end space-x-3">
                    <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
                    <Button variant="primary" icon={Radio} onClick={() => onConfirm(seconds)}>Transmitir</Button>
                </div>
            }
        >
            <div className="space-y-2">
                <Button
                    variant="secondary"
                    icon={Play}
                    fullWidth
                    className={`justify-start ${optionClassName(isAtStart)}`}
                    onClick={() => setSeconds(0)}
                >
                    Do início
                </Button>

                {hasResume && (
                    <Button
                        variant="secondary"
                        icon={RotateCcw}
                        fullWidth
                        className={`justify-start ${optionClassName(isAtResume)}`}
                        onClick={() => setSeconds(Math.floor(resumeTime))}
                    >
                        De onde parei · {formatTime(resumeTime)}
                    </Button>
                )}
            </div>

            <div className="mt-4">
                <p className="text-xs text-ink-2 mb-2">Ajustar ponto</p>
                <div className="flex items-center justify-between bg-surface rounded-lg p-2">
                    <div className="flex items-center space-x-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Voltar 5 minutos"
                            onClick={() => step(-5)}
                        >
                            −5m
                        </Button>
                        <IconButton icon={Minus} label="Voltar 1 minuto" onClick={() => step(-1)} />
                    </div>

                    <span className="text-lg font-semibold text-ink tnum px-2">
                        {formatTime(seconds)}
                    </span>

                    <div className="flex items-center space-x-1">
                        <IconButton icon={Plus} label="Avançar 1 minuto" onClick={() => step(1)} />
                        <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Avançar 5 minutos"
                            onClick={() => step(5)}
                        >
                            +5m
                        </Button>
                    </div>
                </div>
                <p className="text-xs text-ink-3 mt-2">
                    A transmissão começa no keyframe mais próximo, alguns segundos antes do ponto escolhido.
                </p>
            </div>
        </Modal>
    );
}
