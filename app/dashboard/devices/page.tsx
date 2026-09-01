'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, MonitorSmartphone, Pencil, Plus, Trash2, X } from 'lucide-react';
import { apiFetch } from '@/app/lib/apiClient';

interface Device {
    id: string;
    name: string;
    platform: string;
    profileId: string | null;
    createdAt: number;
    lastSeenAt: number;
    revokedAt: number | null;
}

interface Profile {
    id: string;
    name: string;
}

const PLATFORM_LABEL: Record<string, string> = {
    webos: 'LG webOS',
    tizen: 'Samsung Tizen',
    androidtv: 'Android TV',
    browser: 'Navegador',
    unknown: 'Desconhecida'
};

const CODE_LENGTH = 6;

function formatMoment(timestamp: number): string {
    return new Date(timestamp).toLocaleString('pt-BR');
}

function DeviceRow({
    device,
    profiles,
    onRename,
    onRevoke
}: {
    device: Device;
    profiles: Profile[];
    onRename: (id: string, name: string) => Promise<void>;
    onRevoke: (id: string) => Promise<void>;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(device.name);

    const profileName = profiles.find(profile => profile.id === device.profileId)?.name;

    const save = async () => {
        const trimmed = draft.trim();
        if (trimmed && trimmed !== device.name) {
            await onRename(device.id, trimmed);
        }
        setEditing(false);
    };

    return (
        <li className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="flex items-center min-w-0 space-x-3">
                <MonitorSmartphone size={20} className="flex-shrink-0 text-sky-400" />
                <div className="min-w-0">
                    {editing ? (
                        <div className="flex items-center space-x-2">
                            <input
                                autoFocus
                                value={draft}
                                onChange={(event) => setDraft(event.target.value)}
                                onKeyDown={(event) => { if (event.key === 'Enter') void save(); }}
                                data-focusable="true"
                                className="rounded bg-white/10 px-2 py-1 text-white outline-none focus:ring-2 focus:ring-red-500"
                            />
                            <button
                                onClick={() => void save()}
                                data-focusable="true"
                                aria-label="Salvar nome"
                                className="p-1 text-emerald-400 hover:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded"
                            >
                                <Check size={18} />
                            </button>
                            <button
                                onClick={() => { setDraft(device.name); setEditing(false); }}
                                data-focusable="true"
                                aria-label="Cancelar"
                                className="p-1 text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-500 rounded"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    ) : (
                        <p className="truncate font-semibold text-white">{device.name}</p>
                    )}
                    <p className="mt-1 truncate text-xs text-gray-400">
                        {PLATFORM_LABEL[device.platform] ?? PLATFORM_LABEL.unknown}
                        {' · '}Último acesso: {formatMoment(device.lastSeenAt)}
                        {profileName ? ` · Perfil: ${profileName}` : ''}
                    </p>
                </div>
            </div>

            <div className="flex flex-shrink-0 items-center space-x-1">
                {!editing && (
                    <button
                        onClick={() => { setDraft(device.name); setEditing(true); }}
                        data-focusable="true"
                        aria-label="Renomear aparelho"
                        title="Renomear"
                        className="rounded p-2 text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                        <Pencil size={16} />
                    </button>
                )}
                <button
                    onClick={() => void onRevoke(device.id)}
                    data-focusable="true"
                    aria-label="Revogar aparelho"
                    title="Revogar acesso"
                    className="rounded p-2 text-gray-400 hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                    <Trash2 size={16} />
                </button>
            </div>
        </li>
    );
}

/**
 * Server-side screen for approving and managing paired TVs. It always runs on the server
 * origin (never inside the packaged TV client), so plain relative fetches are correct here.
 */
export default function DevicesPage() {
    const [devices, setDevices] = useState<Device[]>([]);
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [profileId, setProfileId] = useState('');
    const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
    const [isBusy, setIsBusy] = useState(false);
    const [codeFromQr, setCodeFromQr] = useState(false);

    // A phone that scanned the TV's QR lands here with `?code=…`. Pre-fill the
    // field so approving is one tap, then drop the param so a refresh after
    // approval starts clean.
    useEffect(() => {
        const fromUrl = new URLSearchParams(window.location.search).get('code');
        const normalized = fromUrl?.trim().toUpperCase().slice(0, CODE_LENGTH) ?? '';
        if (normalized.length === CODE_LENGTH) {
            setCode(normalized);
            setCodeFromQr(true);
        }
        if (fromUrl) {
            window.history.replaceState(null, '', window.location.pathname);
        }
    }, []);

    const loadDevices = useCallback(async () => {
        try {
            const response = await apiFetch('/api/devices');
            const payload = await response.json();
            setDevices(response.ok ? payload.data ?? [] : []);
        } catch {
            setMessage({ type: 'error', text: 'Não foi possível carregar os aparelhos.' });
        }
    }, []);

    useEffect(() => {
        void loadDevices();

        const loadProfiles = async () => {
            try {
                const response = await apiFetch('/api/profiles');
                const payload = await response.json();
                if (response.ok) setProfiles(payload.data ?? []);
            } catch {
                // The profile picker is optional: without it the device uses the first profile.
            }
        };

        void loadProfiles();
    }, [loadDevices]);

    const approve = async () => {
        const trimmedCode = code.trim().toUpperCase();

        if (trimmedCode.length !== CODE_LENGTH) {
            setMessage({ type: 'error', text: `O código tem ${CODE_LENGTH} caracteres.` });
            return;
        }

        setIsBusy(true);

        try {
            const response = await apiFetch('/api/devices/pair/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: trimmedCode,
                    name: name.trim() || undefined,
                    profileId: profileId || null
                })
            });
            const payload = await response.json();

            if (!response.ok) {
                setMessage({ type: 'error', text: payload.error ?? 'Falha ao aprovar o código.' });
                return;
            }

            setMessage({ type: 'success', text: `Aparelho "${payload.device.name}" pareado.` });
            setCode('');
            setCodeFromQr(false);
            setName('');
            setProfileId('');
            await loadDevices();
        } catch {
            setMessage({ type: 'error', text: 'Falha ao aprovar o código.' });
        } finally {
            setIsBusy(false);
        }
    };

    const rename = async (id: string, newName: string) => {
        try {
            await apiFetch('/api/devices', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, name: newName })
            });
            await loadDevices();
        } catch {
            setMessage({ type: 'error', text: 'Falha ao renomear o aparelho.' });
        }
    };

    const revoke = async (id: string) => {
        try {
            await apiFetch('/api/devices', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            await loadDevices();
        } catch {
            setMessage({ type: 'error', text: 'Falha ao revogar o aparelho.' });
        }
    };

    return (
        <div className="p-6 lg:p-10">
            <header className="mb-8">
                <h1 className="text-2xl font-bold text-white">Aparelhos</h1>
                <p className="mt-1 text-sm text-gray-400">
                    Escaneie o QR code que a TV mostra, ou digite o código de {CODE_LENGTH} caracteres.
                    O código vale por 5 minutos e só pode ser usado uma vez.
                </p>
            </header>

            <section className="mb-10 rounded-2xl border border-white/10 bg-white/5 p-5">
                <h2 className="mb-4 text-lg font-semibold text-white">Parear novo aparelho</h2>

                {codeFromQr && (
                    <p className="mb-4 text-sm text-emerald-400">
                        Código preenchido pela TV. Confira o nome e o perfil e toque em Aprovar.
                    </p>
                )}

                <div className="flex flex-col space-y-3 md:flex-row md:items-end md:space-y-0 md:space-x-3">
                    <label className="flex flex-col text-xs text-gray-400">
                        Código
                        <input
                            value={code}
                            onChange={(event) => {
                                setCode(event.target.value.toUpperCase().slice(0, CODE_LENGTH));
                                setCodeFromQr(false);
                            }}
                            onKeyDown={(event) => { if (event.key === 'Enter') void approve(); }}
                            placeholder="ABC234"
                            maxLength={CODE_LENGTH}
                            data-focusable="true"
                            className="mt-1 w-40 rounded-lg bg-black/40 px-3 py-2 text-xl font-bold tracking-[0.3em] text-white outline-none focus:ring-2 focus:ring-red-500"
                        />
                    </label>

                    <label className="flex flex-col text-xs text-gray-400">
                        Nome (opcional)
                        <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="TV da sala"
                            data-focusable="true"
                            className="mt-1 w-56 rounded-lg bg-black/40 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-red-500"
                        />
                    </label>

                    <label className="flex flex-col text-xs text-gray-400">
                        Perfil (opcional)
                        <select
                            value={profileId}
                            onChange={(event) => setProfileId(event.target.value)}
                            data-focusable="true"
                            className="mt-1 w-56 rounded-lg bg-black/40 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-red-500"
                        >
                            <option value="">Perfil padrão</option>
                            {profiles.map(profile => (
                                <option key={profile.id} value={profile.id}>{profile.name}</option>
                            ))}
                        </select>
                    </label>

                    <button
                        onClick={() => void approve()}
                        disabled={isBusy}
                        data-focusable="true"
                        className="flex items-center justify-center space-x-2 rounded-lg bg-red-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-400"
                    >
                        <Plus size={18} />
                        <span>{isBusy ? 'Aprovando...' : 'Aprovar'}</span>
                    </button>
                </div>

                {message && (
                    <p className={`mt-4 text-sm ${message.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                        {message.text}
                    </p>
                )}
            </section>

            <section>
                <h2 className="mb-4 text-lg font-semibold text-white">Aparelhos pareados</h2>

                {devices.length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhum aparelho pareado ainda.</p>
                ) : (
                    <ul className="space-y-2">
                        {devices.map(device => (
                            <DeviceRow
                                key={device.id}
                                device={device}
                                profiles={profiles}
                                onRename={rename}
                                onRevoke={revoke}
                            />
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
