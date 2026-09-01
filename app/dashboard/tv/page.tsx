'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNavigationOverride } from '@/app/context/NavigationContext';
import { Radio, Tv, Film, Layers, Pencil, Check, PowerOff, Play } from 'lucide-react';
import { useLiveSessions, excludeSelf, joinHref, type ShareSession } from '@/app/hooks/useLiveShare';
import { getDeviceName, setDeviceName } from '@/app/lib/device';
import { apiFetch } from '@/app/lib/apiClient';
import CardGrid from '@/components/CardGrid';

const TYPE_ICON = { live: Tv, movie: Film, series: Layers } as const;
const TYPE_LABEL = { live: 'Canal ao vivo', movie: 'Filme', series: 'Série' } as const;

function DeviceNameEditor() {
    const [name, setName] = useState(() => getDeviceName());
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');

    const save = () => {
        const trimmed = draft.trim();
        if (trimmed) {
            setDeviceName(trimmed);
            setName(trimmed);
        }
        setEditing(false);
    };

    return (
        <div className="flex items-center space-x-2 text-sm text-gray-400">
            <span>Este aparelho:</span>
            {editing ? (
                <>
                    <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && save()}
                        className="bg-white/10 rounded px-2 py-1 text-white outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <button onClick={save} className="p-1 text-emerald-400 hover:text-emerald-300" aria-label="Salvar nome">
                        <Check size={18} />
                    </button>
                </>
            ) : (
                <>
                    <span className="text-white font-semibold">{name}</span>
                    <button
                        onClick={() => { setDraft(name); setEditing(true); }}
                        className="p-1 text-gray-400 hover:text-white"
                        aria-label="Editar nome do aparelho"
                    >
                        <Pencil size={16} />
                    </button>
                </>
            )}
        </div>
    );
}

function SessionCard({ session, onSelect }: { session: ShareSession; onSelect: (s: ShareSession) => void }) {
    const Icon = TYPE_ICON[session.contentType];

    return (
        <button
            onClick={() => onSelect(session)}
            data-focusable="true"
            className="text-left rounded-xl overflow-hidden border border-white/10 bg-white/5 hover:bg-white/10 hover:scale-[1.02] cursor-pointer transition-all group focus:outline-none focus:ring-2 focus:ring-red-500"
        >
            {/* 16:9 box via padding-ratio: `aspect-video` (Chrome 88) and its
                globals.css float fallback both misbehave inside a flex parent on
                the webOS TV engines. */}
            <div className="relative bg-black/40 pt-[56.25%]">
                <div className="absolute inset-0 flex items-center justify-center">
                    {session.poster ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={session.poster} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <Icon size={40} className="text-gray-600" />
                    )}
                </div>
                <span className="absolute top-2 left-2 flex items-center space-x-1 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-full">
                    <Radio size={12} className="animate-pulse" /> {session.contentType === 'live' ? 'AO VIVO' : 'TRANSMITINDO'}
                </span>
            </div>
            <div className="p-3">
                <p className="text-white font-semibold truncate">{session.title}</p>
                <p className="text-xs text-gray-400 mt-1 truncate">
                    {TYPE_LABEL[session.contentType]} · {session.deviceName}
                    {session.ip ? ` · ${session.ip}` : ''}
                </p>
            </div>
        </button>
    );
}

/**
 * Actions for the selected broadcast. The options are stacked in a single column so the
 * remote only has to move up/down, and the destructive one asks for confirmation in this
 * same dialog instead of opening a second one on top.
 */
function SessionActionsDialog({
    session,
    busy,
    onJoin,
    onStop,
    onClose,
}: {
    session: ShareSession;
    busy: boolean;
    onJoin: () => void;
    onStop: () => void;
    onClose: () => void;
}) {
    const [confirming, setConfirming] = useState(false);

    // On a TV the remote's back button would otherwise leave the page with the dialog open.
    useNavigationOverride(
        useCallback(() => {
            if (busy) return;
            if (confirming) setConfirming(false);
            else onClose();
        }, [busy, confirming, onClose])
    );

    return (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#1c1c1c] p-6">
                <h2 className="text-xl font-bold text-white truncate">{session.title}</h2>
                <p className="text-sm text-gray-400 mt-1 truncate">
                    {TYPE_LABEL[session.contentType]} · {session.deviceName}
                </p>

                {confirming ? (
                    <>
                        <p className="text-gray-400 mt-5">
                            Encerrar esta transmissão? Todos os aparelhos assistindo serão desconectados.
                        </p>
                        <div className="mt-6 space-y-2">
                            <button
                                onClick={onStop}
                                disabled={busy}
                                autoFocus
                                data-focusable="true"
                                className="w-full flex items-center justify-center px-4 py-3 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-500 disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-white"
                            >
                                <PowerOff size={18} className="mr-2" /> {busy ? 'Encerrando...' : 'Encerrar agora'}
                            </button>
                            <button
                                onClick={() => setConfirming(false)}
                                disabled={busy}
                                data-focusable="true"
                                className="w-full px-4 py-3 rounded-lg bg-white/10 text-white hover:bg-white/20 disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500"
                            >
                                Voltar
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="mt-6 space-y-2">
                        <button
                            onClick={onJoin}
                            autoFocus
                            data-focusable="true"
                            className="w-full flex items-center justify-center px-4 py-3 rounded-lg bg-white text-black font-semibold hover:bg-gray-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500"
                        >
                            <Play size={18} className="mr-2" /> Assistir
                        </button>
                        <button
                            onClick={() => setConfirming(true)}
                            data-focusable="true"
                            className="w-full flex items-center justify-center px-4 py-3 rounded-lg bg-white/10 text-white hover:bg-red-600 cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                        >
                            <PowerOff size={18} className="mr-2" /> Encerrar transmissão
                        </button>
                        <button
                            onClick={onClose}
                            data-focusable="true"
                            className="w-full px-4 py-3 rounded-lg text-gray-400 hover:text-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500"
                        >
                            Cancelar
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function ModoTvPage() {
    const router = useRouter();
    const { sessions, loading, refresh } = useLiveSessions(8000);
    const [selected, setSelected] = useState<ShareSession | null>(null);
    const [stopping, setStopping] = useState(false);
    // excludeSelf uses localStorage (getDeviceId), evaluated on every list change.
    const visible = useMemo(() => excludeSelf(sessions), [sessions]);

    const confirmStop = async () => {
        if (!selected) return;
        setStopping(true);
        const query = new URLSearchParams({
            deviceId: selected.deviceId,
            contentType: selected.contentType,
            streamId: selected.streamId,
        });
        try {
            await apiFetch(`/api/relay/vod?${query.toString()}`, { method: 'DELETE' });
        } catch {
            /* the list refresh below shows whether it actually ended */
        }
        setStopping(false);
        setSelected(null);
        refresh();
    };

    return (
        <div className="p-4 md:p-8 text-white">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0 md:space-x-3 mb-8">
                <div>
                    <h1 className="text-3xl font-bold flex items-center space-x-3">
                        <Radio className="text-red-500" /> Modo TV
                    </h1>
                    <p className="text-gray-400 mt-2 max-w-2xl">
                        Assista, sem gastar uma nova conexão, ao que outros aparelhos estão transmitindo agora.
                        Para transmitir, ligue <strong className="text-white">Transmitir</strong> ao assistir um canal.
                    </p>
                </div>
                <DeviceNameEditor />
            </div>

            {loading && visible.length === 0 ? (
                <p className="text-gray-500">Procurando transmissões...</p>
            ) : visible.length === 0 ? (
                <div className="text-center py-20 text-gray-500">
                    <Tv size={48} className="mx-auto mb-4 opacity-40" />
                    <p className="text-lg">Ninguém está transmitindo agora.</p>
                    <p className="text-sm mt-1">Abra um canal e ligue “Transmitir” para aparecer aqui.</p>
                </div>
            ) : (
                <CardGrid base={2} sm={3} lg={4} gap={4}>
                    {visible.map((s) => (
                        <SessionCard key={s.deviceId} session={s} onSelect={setSelected} />
                    ))}
                </CardGrid>
            )}

            {selected && (
                <SessionActionsDialog
                    session={selected}
                    busy={stopping}
                    onJoin={() => router.push(joinHref(selected))}
                    onStop={confirmStop}
                    onClose={() => setSelected(null)}
                />
            )}
        </div>
    );
}
