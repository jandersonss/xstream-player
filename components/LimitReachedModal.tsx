'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Radio, Tv, X, ArrowRight } from 'lucide-react';
import { useLiveSessions, excludeSelf, joinHref, type ShareSession } from '@/app/hooks/useLiveShare';

interface LimitReachedModalProps {
    open: boolean;
    onClose: () => void;
}

/**
 * Shown when the user tries to watch but the account's connection limit is
 * exhausted. Offers joining an already-active broadcast (TV Mode), which does
 * not consume a new connection.
 */
export default function LimitReachedModal({ open, onClose }: LimitReachedModalProps) {
    const router = useRouter();
    const { sessions, loading } = useLiveSessions(6000);
    const shares = useMemo(() => excludeSelf(sessions), [sessions]);

    if (!open) return null;

    const join = (s: ShareSession) => {
        router.push(joinHref(s));
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
            <div className="w-full max-w-lg bg-[#181818] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                <div className="flex items-start justify-between p-6 pb-4">
                    <div>
                        <h2 className="text-xl font-bold text-white">Limite de conexões atingido</h2>
                        <p className="text-gray-400 text-sm mt-1">
                            Todas as conexões da sua conta estão em uso. Você pode entrar, sem gastar uma
                            nova conexão, no que outro aparelho está transmitindo agora.
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-white p-1" aria-label="Fechar">
                        <X size={22} />
                    </button>
                </div>

                <div className="px-6 pb-4 max-h-72 overflow-y-auto space-y-2">
                    {loading && shares.length === 0 ? (
                        <p className="text-gray-500 text-sm py-4">Procurando transmissões...</p>
                    ) : shares.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <Tv size={36} className="mx-auto mb-2 opacity-40" />
                            <p className="text-sm">Nenhuma transmissão ativa no momento.</p>
                        </div>
                    ) : (
                        shares.map((s) => (
                            <button
                                key={s.deviceId}
                                onClick={() => join(s)}
                                className="w-full flex items-center space-x-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-left focus:outline-none focus:ring-2 focus:ring-red-500"
                            >
                                <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-red-600/20 text-red-400 shrink-0">
                                    <Radio size={20} className="animate-pulse" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-white font-semibold truncate">{s.title}</span>
                                    <span className="block text-xs text-gray-400 truncate">
                                        {s.deviceName}{s.ip ? ` · ${s.ip}` : ''}
                                    </span>
                                </span>
                                <ArrowRight size={18} className="text-gray-500 shrink-0" />
                            </button>
                        ))
                    )}
                </div>

                <div className="p-4 border-t border-white/10 flex justify-end space-x-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-gray-300 hover:bg-white/5 transition-colors"
                    >
                        Fechar
                    </button>
                    <button
                        onClick={() => router.push('/dashboard/tv')}
                        className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold flex items-center space-x-2 transition-colors"
                    >
                        <Radio size={18} /> Abrir Modo TV
                    </button>
                </div>
            </div>
        </div>
    );
}
