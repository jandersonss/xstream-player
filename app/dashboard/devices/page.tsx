'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, LogOut, MonitorSmartphone, Pencil, Plus, Trash2, Tv, X } from 'lucide-react';
import { apiFetch } from '@/app/lib/apiClient';
import { useT } from '@/app/context/I18nContext';
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

const PLATFORM_KEYS = ['webos', 'tizen', 'androidtv', 'browser', 'unknown'] as const;

const CODE_LENGTH = 6;

function formatMoment(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
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
    const t = useT();
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
                            <IconButton icon={Check} label={t('devices.saveName')} onClick={() => void save()} />
                            <IconButton
                                icon={X}
                                label={t('common.cancel')}
                                onClick={() => { setDraft(device.name); setEditing(false); }}
                            />
                        </div>
                    ) : (
                        <p className="truncate font-semibold text-ink">
                            {device.name}
                            {isCurrent && <span className="ml-2 text-xs font-normal text-ink-2">· {t('devices.thisDevice')}</span>}
                        </p>
                    )}
                    <p className="mt-1 truncate text-xs text-ink-2">
                        {t(`devices.platform.${(PLATFORM_KEYS as readonly string[]).includes(device.platform) ? device.platform : 'unknown'}`)}
                        {' · '}{t('devices.lastAccess')}: <span className="tnum">{formatMoment(device.lastSeenAt)}</span>
                        {profileName ? ` · ${t('devices.profilePrefix')}: ${profileName}` : ''}
                    </p>
                </div>
            </div>

            {!editing && (
                <div className="flex flex-shrink-0 items-center space-x-1">
                    <IconButton
                        icon={Pencil}
                        label={t('devices.renameDevice')}
                        onClick={() => { setDraft(device.name); setEditing(true); }}
                    />
                    <IconButton
                        icon={Trash2}
                        label={t('devices.revokeDevice')}
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
    const t = useT();
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
            setMessage({ type: 'error', text: t('devices.loadError') });
        }
    }, [t]);

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
                setMessage({ type: 'error', text: payload.error ?? t('devices.disconnectError') });
                return;
            }
            setDisconnected(true);
            setTimeout(attemptCloseTvApp, 1500);
        } catch {
            setMessage({ type: 'error', text: t('devices.disconnectError') });
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
            setMessage({ type: 'error', text: t('devices.codeLengthError', { n: CODE_LENGTH }) });
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
                setMessage({ type: 'error', text: payload.error ?? t('devices.approveError') });
                return;
            }

            setMessage({ type: 'success', text: t('devices.devicePaired', { name: payload.device.name }) });
            setCode('');
            setCodeFromQr(false);
            setName('');
            setProfileId('');
            await loadDevices();
        } catch {
            setMessage({ type: 'error', text: t('devices.approveError') });
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
            setMessage({ type: 'error', text: t('devices.renameError') });
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
            setMessage({ type: 'error', text: t('devices.revokeError') });
        }
    };

    if (disconnected) {
        return (
            <EmptyState
                icon={Tv}
                title={t('devices.disconnectedTitle')}
                description={t('devices.disconnectedDesc')}
            />
        );
    }

    return (
        <div className="px-6 md:px-10 lg:px-14 pt-6 pb-10">
            <SectionHeader
                title={t('devices.title')}
                description={t('devices.intro', { n: CODE_LENGTH })}
            />

            {currentDeviceId && (
                <section className="mt-8 pt-8 border-t border-line">
                    <SectionHeader title={t('devices.thisTv')} />
                    <div className="bg-surface-2 border border-line rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between">
                        <div className="flex items-start space-x-3">
                            <Badge tone="warn">{t('devices.sessionActive')}</Badge>
                            <div>
                                <p className="font-semibold text-ink">{t('devices.watchingViaTv')}</p>
                                <p className="mt-1 text-sm text-ink-2">
                                    {t('devices.pointToOtherServer')}
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
                                    {t('common.cancel')}
                                </Button>
                                <Button
                                    variant="danger"
                                    icon={LogOut}
                                    disabled={disconnecting}
                                    onClick={() => void disconnectThisDevice()}
                                >
                                    {disconnecting ? t('devices.disconnecting') : t('devices.confirm')}
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
                                {t('devices.disconnectSwitch')}
                            </Button>
                        )}
                    </div>
                </section>
            )}

            <section className="mt-8 pt-8 border-t border-line">
                <SectionHeader title={t('devices.pairDevice')} />

                {codeFromQr && (
                    <p className="mb-4 text-sm text-ok">
                        {t('devices.codeFilled')}
                    </p>
                )}

                <div className="flex flex-col space-y-3 md:flex-row md:items-end md:space-y-0 md:space-x-3">
                    <Field label={t('devices.codeLabel')}>
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

                    <Field label={t('devices.nameLabel')}>
                        <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder={t('devices.namePlaceholder')}
                            data-focusable="true"
                            className={`${inputClassName} w-56`}
                        />
                    </Field>

                    <Field label={t('devices.profileLabel')}>
                        <select
                            value={profileId}
                            onChange={(event) => setProfileId(event.target.value)}
                            data-focusable="true"
                            className={`${inputClassName} w-56`}
                        >
                            <option value="">{t('devices.defaultProfile')}</option>
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
                        {isBusy ? t('devices.approving') : t('devices.approve')}
                    </Button>
                </div>

                {message && (
                    <p className={`mt-4 text-sm ${message.type === 'error' ? 'text-brand' : 'text-ok'}`}>
                        {message.text}
                    </p>
                )}
            </section>

            <section className="mt-8 pt-8 border-t border-line">
                <SectionHeader title={t('devices.pairedDevices')} count={devices.length} />

                {devices.length === 0 ? (
                    <EmptyState
                        icon={Tv}
                        title={t('devices.noDevicesTitle')}
                        description={t('devices.noDevicesDesc')}
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
