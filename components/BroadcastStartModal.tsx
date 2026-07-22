'use client';

import { useState } from 'react';
import { Radio, Play, RotateCcw, Minus, Plus, X } from 'lucide-react';

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
 * progress, and unmounting is what discards a previous pick.
 */
export default function BroadcastStartModal({
    resumeTime,
    duration,
    onCancel,
    onConfirm,
}: BroadcastStartModalProps) {
    const maxSeconds = duration && duration > END_MARGIN_S ? duration - END_MARGIN_S : undefined;
    const [seconds, setSeconds] = useState(() => (resumeTime > 0 ? Math.floor(resumeTime) : 0));

    const clamp = (value: number) => {
        const floored = Math.max(0, Math.floor(value));
        return maxSeconds !== undefined ? Math.min(floored, Math.floor(maxSeconds)) : floored;
    };
    const step = (deltaMinutes: number) => setSeconds((s) => clamp(s + deltaMinutes * 60));

    const hasResume = resumeTime > 0;
    const isAtStart = seconds === 0;
    const isAtResume = hasResume && seconds === Math.floor(resumeTime);

    const optionClass = (active: boolean) =>
        `w-full flex items-center space-x-3 p-3 rounded-xl text-left transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 ${
            active ? 'bg-red-600/20 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'
        }`;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
            <div className="w-full max-w-md bg-[#181818] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                <div className="flex items-start justify-between p-6 pb-4">
                    <div>
                        <h2 className="text-xl font-bold text-white">Começar a transmitir de onde?</h2>
                        <p className="text-gray-400 text-sm mt-1">
                            Quem entrar depois pega a transmissão no ponto em que ela estiver, como um canal.
                        </p>
                    </div>
                    <button
                        onClick={onCancel}
                        className="text-gray-500 hover:text-white p-1"
                        aria-label="Fechar"
                        data-focusable="true"
                    >
                        <X size={22} />
                    </button>
                </div>

                <div className="px-6 pb-2 space-y-2">
                    <button
                        onClick={() => setSeconds(0)}
                        className={optionClass(isAtStart)}
                        data-focusable="true"
                    >
                        <Play size={20} className="shrink-0" />
                        <span className="font-semibold">Do início</span>
                    </button>

                    {hasResume && (
                        <button
                            onClick={() => setSeconds(Math.floor(resumeTime))}
                            className={optionClass(isAtResume)}
                            data-focusable="true"
                        >
                            <RotateCcw size={20} className="shrink-0" />
                            <span className="font-semibold">
                                De onde parei · {formatTime(resumeTime)}
                            </span>
                        </button>
                    )}
                </div>

                <div className="px-6 py-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Ajustar ponto</p>
                    <div className="flex items-center justify-between bg-white/5 rounded-xl p-2">
                        <div className="flex items-center space-x-1">
                            <button
                                onClick={() => step(-5)}
                                className="px-2 py-2 rounded-lg text-gray-300 hover:bg-white/10 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-red-500"
                                data-focusable="true"
                                aria-label="Voltar 5 minutos"
                            >
                                −5m
                            </button>
                            <button
                                onClick={() => step(-1)}
                                className="p-2 rounded-lg text-gray-300 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-red-500"
                                data-focusable="true"
                                aria-label="Voltar 1 minuto"
                            >
                                <Minus size={18} />
                            </button>
                        </div>

                        <span className="text-2xl font-bold text-white tabular-nums px-2">
                            {formatTime(seconds)}
                        </span>

                        <div className="flex items-center space-x-1">
                            <button
                                onClick={() => step(1)}
                                className="p-2 rounded-lg text-gray-300 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-red-500"
                                data-focusable="true"
                                aria-label="Avançar 1 minuto"
                            >
                                <Plus size={18} />
                            </button>
                            <button
                                onClick={() => step(5)}
                                className="px-2 py-2 rounded-lg text-gray-300 hover:bg-white/10 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-red-500"
                                data-focusable="true"
                                aria-label="Avançar 5 minutos"
                            >
                                +5m
                            </button>
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                        A transmissão começa no keyframe mais próximo, alguns segundos antes do ponto escolhido.
                    </p>
                </div>

                <div className="p-4 border-t border-white/10 flex justify-end space-x-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg text-gray-300 hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                        data-focusable="true"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => onConfirm(seconds)}
                        className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold flex items-center space-x-2 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                        data-focusable="true"
                    >
                        <Radio size={18} /> <span>Transmitir</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
