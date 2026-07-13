'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Radio, Tv, Film, Layers, Pencil, Check } from 'lucide-react';
import { useLiveSessions, excludeSelf, joinHref, type ShareSession } from '@/app/hooks/useLiveShare';
import { getDeviceName, setDeviceName } from '@/app/lib/device';

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
        <div className="flex items-center gap-2 text-sm text-gray-400">
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

function SessionCard({ session, onJoin }: { session: ShareSession; onJoin: (s: ShareSession) => void }) {
    const Icon = TYPE_ICON[session.contentType];

    return (
        <button
            onClick={() => onJoin(session)}
            data-focusable="true"
            className="text-left rounded-xl overflow-hidden border border-white/10 bg-white/5 hover:bg-white/10 hover:scale-[1.02] cursor-pointer transition-all group focus:outline-none focus:ring-2 focus:ring-red-500"
        >
            <div className="aspect-video bg-black/40 relative flex items-center justify-center">
                {session.poster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={session.poster} alt="" className="w-full h-full object-cover" />
                ) : (
                    <Icon size={40} className="text-gray-600" />
                )}
                <span className="absolute top-2 left-2 flex items-center gap-1 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-full">
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

export default function ModoTvPage() {
    const router = useRouter();
    const { sessions, loading } = useLiveSessions(8000);
    // excludeSelf uses localStorage (getDeviceId), evaluated on every list change.
    const visible = useMemo(() => excludeSelf(sessions), [sessions]);

    const handleJoin = (s: ShareSession) => {
        router.push(joinHref(s));
    };

    return (
        <div className="p-4 md:p-8 text-white">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-8">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
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
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {visible.map((s) => (
                        <SessionCard key={s.deviceId} session={s} onJoin={handleJoin} />
                    ))}
                </div>
            )}
        </div>
    );
}
