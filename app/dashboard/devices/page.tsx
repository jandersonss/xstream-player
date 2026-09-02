'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, LogOut, MonitorSmartphone, Pencil, Plus, Trash2, Tv, X } from 'lucide-react';
import { apiFetch } from '@/app/lib/apiClient';
import SectionHeader from '@/components/ui/SectionHeader';
import Field, { inputClassName } from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';

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
    isCurrent,
    onRename,
    onRevoke
}: {
    device: Device;
    profiles: Profile[];
    isCurrent: boolean;
    onRename: (id: string, name: string) => Promise<void>;
    onRevoke: (id: string) => Promise<void>;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(device.name);
    const rowRef = useRef<HTMLLIElement>(null);
    const wasEditingRef = useRef(false);

    // The rename input unmounts on save/cancel, dropping focus to `body` —
    // the next D-pad press would then jump to the first focusable element on
    // the whole page (app/hooks/useTvNavigation.ts) instead of staying here.
    useEffect(() => {
        if (wasEditingRef.current && !editing) {
            rowRef.current?.querySelector<HTMLElement>('[data-focusable="true"]')?.focus();
        }
        wasEditingRef.current = editing;
    }, [editing]);

    const profileName = profiles.find(profile => profile.id === device.profileId)?.name;

    const save = async () => {
        const trimmed = draft.trim();
        if (trimmed && trimmed !== device.name) {
            await onRename(device.id, trimmed);
        }
        setEditing(false);
    };

    return (
        <li ref={rowRef} className="flex items-center justify-between bg-surface border border-line rounded-xl p-4">
            <div className="flex items-center min-w-0 space-x-3">
                <MonitorSmartphone size={20} className="flex-shrink-0 text-ink-2" />
                <div className="min-w-0">
                    {editing ? (
                        <div className="flex items-center space-x-2">
                            <input
                                autoFocus
                                value={draft}
                                onChange={(event) => setDraft(event.target.value)}
                                onKeyDown={(event) => { if (event.key === 'Enter') void save(); }}
                                data-focusable="true"
                                tabIndex={0}
                                className={inputClassName}
                            />
                            <IconButton icon={Check} label="Salvar nome" onClick={() => void save()} />
                            <IconButton
                                icon={X}
                                label="Cancelar"
                                onClick={() => { setDraft(device.name); setEditing(false); }}
                            />
                        </div>
                    ) : (
                        <p className="truncate font-semibold text-ink">
                            {device.name}
                            {isCurrent && <span className="ml-2 text-xs font-normal text-ink-2">· este aparelho</span>}
                        </p>
                    )}
                    <p className="mt-1 truncate text-xs text-ink-2">
                        {PLATFORM_LABEL[device.platform] ?? PLATFORM_LABEL.unknown}
                        {' · '}Último acesso: <span className="tnum">{formatMoment(device.lastSeenAt)}</span>
                        {profileName ? ` · Perfil: ${profileName}` : ''}
                    </p>
                </div>
            </div>

            {!editing && (
                <div className="flex flex-shrink-0 items-center space-x-1">
                    <IconButton
                        icon={Pencil}
                        label="Renomear aparelho"
                        onClick={() => { setDraft(device.name); setEditing(true); }}
                    />
                    <IconButton
                        icon={Trash2}
                        label="Revogar aparelho"
                        onClick={() => void onRevoke(device.id)}
                    />
                </div>
            )}
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
    const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
    const [disconnecting, setDisconnecting] = useState(false);
    const [disconnected, setDisconnected] = useState(false);
    const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

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
            setCurrentDeviceId(response.ok ? payload.currentDeviceId ?? null : null);
        } catch {
            setMessage({ type: 'error', text: 'Não foi possível carregar os aparelhos.' });
        }
    }, []);

    // Best effort: close the packaged TV app after disconnecting, so relaunching
    // it drops straight onto the setup screen.
    const attemptCloseTvApp = () => {
        try {
            const w = window as unknown as {
                webOS?: { platformBack?: () => void };
                tizen?: { application?: { getCurrentApplication: () => { exit: () => void } } };
            };
            if (w.webOS?.platformBack) return w.webOS.platformBack();
            if (w.tizen?.application) return w.tizen.application.getCurrentApplication().exit();
            window.close();
        } catch {
            /* the instruction on screen covers the manual path */
        }
    };

    const disconnectThisDevice = async () => {
        setConfirmingDisconnect(false);
        setDisconnecting(true);
        try {
            const response = await apiFetch('/api/devices/session', { method: 'DELETE' });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                setMessage({ type: 'error', text: payload.error ?? 'Falha ao desconectar.' });
                return;
            }
            setDisconnected(true);
            setTimeout(attemptCloseTvApp, 1500);
        } catch {
            setMessage({ type: 'error', text: 'Falha ao desconectar.' });
        } finally {
            setDisconnecting(false);
        }
    };

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

    if (disconnected) {
        return (
            <EmptyState
                icon={Tv}
                title="Aparelho desconectado"
                description="Feche e abra o app na TV de novo. Ele vai voltar para a tela de conexão, onde você pode confirmar o mesmo servidor ou informar outro."
            />
        );
    }

    return (
        <div className="px-6 md:px-10 lg:px-14 pt-6 pb-10">
            <SectionHeader
                title="Aparelhos"
                description={`Escaneie o QR code que a TV mostra, ou digite o código de ${CODE_LENGTH} caracteres. O código vale por 5 minutos e só pode ser usado uma vez.`}
            />

            {currentDeviceId && (
                <section className="mt-8 pt-8 border-t border-line">
                    <SectionHeader title="Esta TV" />
                    <div className="bg-surface-2 border border-line rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between">
                        <div className="flex items-start space-x-3">
                            <Badge tone="warn">Sessão ativa</Badge>
                            <div>
                                <p className="font-semibold text-ink">Você está vendo esta tela pela TV</p>
                                <p className="mt-1 text-sm text-ink-2">
                                    Para apontar esta TV para outro servidor (ex.: alternar entre dev e prod),
                                    desconecte e pareie de novo.
                                </p>
                            </div>
                        </div>

                        {confirmingDisconnect ? (
                            <div className="mt-4 md:mt-0 md:ml-4 flex flex-shrink-0 items-center space-x-3">
                                <Button
                                    variant="ghost"
                                    disabled={disconnecting}
                                    onClick={() => setConfirmingDisconnect(false)}
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    variant="danger"
                                    icon={LogOut}
                                    disabled={disconnecting}
                                    onClick={() => void disconnectThisDevice()}
                                >
                                    {disconnecting ? 'Desconectando...' : 'Confirmar'}
                                </Button>
                            </div>
                        ) : (
                            <Button
                                variant="danger"
                                icon={LogOut}
                                disabled={disconnecting}
                                onClick={() => setConfirmingDisconnect(true)}
                                className="mt-4 md:mt-0 md:ml-4 flex-shrink-0"
                            >
                                Desconectar e trocar servidor
                            </Button>
                        )}
                    </div>
                </section>
            )}

            <section className="mt-8 pt-8 border-t border-line">
                <SectionHeader title="Parear aparelho" />

                {codeFromQr && (
                    <p className="mb-4 text-sm text-ok">
                        Código preenchido pela TV. Confira o nome e o perfil e toque em Aprovar.
                    </p>
                )}

                <div className="flex flex-col space-y-3 md:flex-row md:items-end md:space-y-0 md:space-x-3">
                    <Field label="Código">
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
                            className={`${inputClassName} w-40 uppercase tracking-[0.3em] text-center tnum`}
                        />
                    </Field>

                    <Field label="Nome (opcional)">
                        <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="TV da sala"
                            data-focusable="true"
                            className={`${inputClassName} w-56`}
                        />
                    </Field>

                    <Field label="Perfil (opcional)">
                        <select
                            value={profileId}
                            onChange={(event) => setProfileId(event.target.value)}
                            data-focusable="true"
                            className={`${inputClassName} w-56`}
                        >
                            <option value="">Perfil padrão</option>
                            {profiles.map(profile => (
                                <option key={profile.id} value={profile.id}>{profile.name}</option>
                            ))}
                        </select>
                    </Field>

                    <Button
                        variant="primary"
                        icon={Plus}
                        disabled={isBusy}
                        onClick={() => void approve()}
                    >
                        {isBusy ? 'Aprovando...' : 'Aprovar'}
                    </Button>
                </div>

                {message && (
                    <p className={`mt-4 text-sm ${message.type === 'error' ? 'text-brand' : 'text-ok'}`}>
                        {message.text}
                    </p>
                )}
            </section>

            <section className="mt-8 pt-8 border-t border-line">
                <SectionHeader title="Aparelhos pareados" count={devices.length} />

                {devices.length === 0 ? (
                    <EmptyState
                        icon={Tv}
                        title="Nenhum aparelho pareado ainda"
                        description="A TV mostra um código ao abrir o app — digite-o acima para parear."
                        compact
                    />
                ) : (
                    <ul className="space-y-2">
                        {devices.map(device => (
                            <DeviceRow
                                key={device.id}
                                device={device}
                                profiles={profiles}
                                isCurrent={device.id === currentDeviceId}
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
