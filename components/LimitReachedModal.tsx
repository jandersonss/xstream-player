'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Radio, Tv, ArrowRight } from 'lucide-react';
import { useLiveSessions, excludeSelf, joinHref, type ShareSession } from '@/app/hooks/useLiveShare';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';

interface LimitReachedModalProps {
    open: boolean;
    onClose: () => void;
}

/**
 * Shown when the user tries to watch but the account's connection limit is
 * exhausted. Offers joining an already-active broadcast (TV Mode), which does
 * not consume a new connection.
 *
 * Fixes D1: the previous version rendered no `data-focusable` elements at all,
 * so a TV remote could neither reach a session row nor close the modal.
 */
export default function LimitReachedModal({ open, onClose }: LimitReachedModalProps) {
    const router = useRouter();
    const { sessions, loading } = useLiveSessions(6000);
    const shares = useMemo(() => excludeSelf(sessions), [sessions]);

    const join = (s: ShareSession) => {
        router.push(joinHref(s));
    };

    return (
        <Modal
            isOpen={open}
            onClose={onClose}
            title="Limite de conexões atingido"
            description="Todas as conexões da sua conta estão em uso. Você pode entrar, sem gastar uma nova conexão, no que outro aparelho está transmitindo agora."
            size="md"
            footer={
                <div className="flex justify-end space-x-3">
                    <Button variant="ghost" onClick={onClose}>Fechar</Button>
                    <Button variant="primary" icon={Radio} onClick={() => router.push('/dashboard/tv')}>
                        Abrir Modo TV
                    </Button>
                </div>
            }
        >
            <div className="max-h-72 overflow-y-auto space-y-2">
                {loading && shares.length === 0 ? (
                    <p className="text-ink-2 text-sm py-4">Procurando transmissões...</p>
                ) : shares.length === 0 ? (
                    <div className="text-center py-8 text-ink-2">
                        <Tv size={36} className="mx-auto mb-2 opacity-40" />
                        <p className="text-sm">Nenhuma transmissão ativa no momento.</p>
                    </div>
                ) : (
                    shares.map((s) => (
                        <button
                            key={s.deviceId}
                            onClick={() => join(s)}
                            data-focusable="true"
                            tabIndex={0}
                            className="w-full flex items-center space-x-3 p-3 rounded-xl bg-surface border border-line text-left"
                        >
                            <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-brand-soft text-brand shrink-0">
                                <Radio size={20} className="animate-pulse" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-ink font-semibold truncate">{s.title}</span>
                                <span className="block text-xs text-ink-2 truncate">
                                    {s.deviceName}{s.ip ? ` · ${s.ip}` : ''}
                                </span>
                            </span>
                            <ArrowRight size={18} className="text-ink-3 shrink-0" />
                        </button>
                    ))
                )}
            </div>
        </Modal>
    );
}
