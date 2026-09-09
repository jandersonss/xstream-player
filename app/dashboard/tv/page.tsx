'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNavigationOverride } from '@/app/context/NavigationContext';
import { useT } from '@/app/context/I18nContext';
import { Radio, Tv, Film, Layers, Pencil, Check, PowerOff, Play } from 'lucide-react';
import { useLiveSessions, excludeSelf, joinHref, type ShareSession } from '@/app/hooks/useLiveShare';
import { getDeviceName, setDeviceName } from '@/app/lib/device';
import { apiFetch } from '@/app/lib/apiClient';
import CardGrid from '@/components/CardGrid';
import SectionHeader from '@/components/ui/SectionHeader';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Field, { inputClassName } from '@/components/ui/Field';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';

const TYPE_ICON = { live: Tv, movie: Film, series: Layers } as const;
const TYPE_LABEL_KEY = { live: 'tv.channelLive', movie: 'tv.movie', series: 'tv.series' } as const;

type Translate = (key: string, vars?: Record<string, string | number>) => string;

function formatElapsed(ms: number, t: Translate): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        return t('tv.elapsedHours', { h: hours, m: minutes % 60 });
    }
    if (minutes > 0) return t('tv.elapsedMinutes', { m: minutes, s: seconds });
    return t('tv.elapsedSeconds', { s: seconds });
}

function DeviceNameEditor() {
    const t = useT();
    const [name, setName] = useState(() => getDeviceName());
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const editButtonRef = useRef<HTMLButtonElement>(null);
    const wasEditingRef = useRef(false);

    // The input unmounts on save, dropping focus to `body` — the next D-pad
    // press would otherwise jump to the first focusable element on the whole
    // page (app/hooks/useTvNavigation.ts) instead of staying near this control.
    useEffect(() => {
        if (wasEditingRef.current && !editing) {
            editButtonRef.current?.focus();
        }
        wasEditingRef.current = editing;
    }, [editing]);

    const save = () => {
        const trimmed = draft.trim();
        if (trimmed) {
            setDeviceName(trimmed);
            setName(trimmed);
        }
        setEditing(false);
    };

    if (editing) {
        return (
            <div className="flex items-end space-x-2">
                <Field label={t('tv.thisDevice')}>
                    <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && save()}
                        data-focusable="true"
                        tabIndex={0}
                        className={inputClassName}
                    />
                </Field>
                <Button
                    icon={Check}
                    variant="secondary"
                    aria-label={t('tv.saveName')}
                    onClick={save}
                >
                    {t('common.save')}
                </Button>
            </div>
        );
    }

    return (
        <div className="flex items-center space-x-2 text-sm text-ink-2">
            <span>{t('tv.thisDevice')}</span>
            <span className="text-ink font-semibold">{name}</span>
            <button
                ref={editButtonRef}
                onClick={() => { setDraft(name); setEditing(true); }}
                data-focusable="true"
                tabIndex={0}
                aria-label={t('tv.editName')}
                className="p-1 text-ink-2 hover:text-ink"
            >
                <Pencil size={16} />
            </button>
        </div>
    );
}

function SessionCard({
    session,
    now,
    onSelect,
}: {
    session: ShareSession;
    /** Wall clock, ticked from an effect — components must stay pure, so `Date.now()`
        cannot be called directly during render. */
    now: number;
    onSelect: (s: ShareSession) => void;
}) {
    const t = useT();
    const Icon = TYPE_ICON[session.contentType];
    // `updatedAt` is refreshed on every heartbeat (~20s), not the original broadcast
    // start — the backend (tvModeStore.ts) does not track a separate start timestamp.
    // It is still the closest available proxy for "how long it has been going".
    const elapsed = formatElapsed(now - session.updatedAt, t);

    return (
        <button
            onClick={() => onSelect(session)}
            data-focusable="true"
            tabIndex={0}
            className="text-left bg-surface-2 border border-line rounded-xl overflow-hidden"
        >
            <div className="ratio ratio-wide bg-bg">
                <div className="ratio-fill flex items-center justify-center">
                    {session.poster ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={session.poster} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <Icon size={40} className="text-ink-3" />
                    )}
                </div>
                <span className="absolute top-2 left-2">
                    <Badge tone="live" dot>
                        {session.contentType === 'live' ? t('tv.live') : t('tv.broadcasting')}
                    </Badge>
                </span>
            </div>
            <div className="p-3">
                <p className="text-ink font-semibold truncate">{session.title}</p>
                <p className="text-xs text-ink-2 mt-1 truncate">
                    {t(TYPE_LABEL_KEY[session.contentType])} · {session.deviceName}
                    {session.ip ? ` · ${session.ip}` : ''}
                </p>
                <p className="text-xs text-ink-3 mt-1 tnum">{t('tv.timeAgo', { time: elapsed })}</p>
            </div>
        </button>
    );
}

/**
 * Actions for the selected broadcast. A single Modal alternates between the "actions"
 * and "confirm stop" states instead of opening a second modal on top — opening one
 * would complicate the useNavigationOverride stack (Back would have to know which
 * modal to close first).
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
    const t = useT();

    // On a TV the remote's back button would otherwise leave the page with the dialog open.
    // Modal itself also registers onClose via useNavigationOverride; this override sits on
    // top of it (registered after) so Back steps out of "confirming" first, then closes.
    useNavigationOverride(
        useCallback(() => {
            if (busy) return;
            if (confirming) setConfirming(false);
            else onClose();
        }, [busy, confirming, onClose])
    );

    return (
        <Modal isOpen onClose={onClose} title={session.title} description={`${t(TYPE_LABEL_KEY[session.contentType])} · ${session.deviceName}`} size="sm">
            {confirming ? (
                <div className="space-y-3">
                    <p className="text-sm text-ink-2">
                        {t('tv.stopConfirm')}
                    </p>
                    <div className="space-y-3">
                        <Button
                            variant="danger"
                            icon={PowerOff}
                            fullWidth
                            disabled={busy}
                            onClick={onStop}
                        >
                            {busy ? t('tv.stopping') : t('tv.stopNow')}
                        </Button>
                        <Button
                            variant="secondary"
                            fullWidth
                            disabled={busy}
                            onClick={() => setConfirming(false)}
                        >
                            {t('tv.back')}
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    <Button variant="primary" icon={Play} fullWidth onClick={onJoin}>
                        {t('tv.watch')}
                    </Button>
                    <Button variant="danger" icon={PowerOff} fullWidth onClick={() => setConfirming(true)}>
                        {t('tv.stopBroadcast')}
                    </Button>
                    <Button variant="ghost" fullWidth onClick={onClose}>
                        {t('tv.cancel')}
                    </Button>
                </div>
            )}
        </Modal>
    );
}

export default function ModoTvPage() {
    const router = useRouter();
    const t = useT();
    const { sessions, loading, refresh } = useLiveSessions(8000);
    const [selected, setSelected] = useState<ShareSession | null>(null);
    const [stopping, setStopping] = useState(false);
    // excludeSelf uses localStorage (getDeviceId), evaluated on every list change.
    const visible = useMemo(() => excludeSelf(sessions), [sessions]);

    // Ticked wall clock for the "started X ago" labels — read from state (set in an
    // effect) instead of calling `Date.now()` straight in render.
    const [now, setNow] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

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
        <div className="px-6 md:px-10 lg:px-14 pt-6 pb-10">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
                <SectionHeader
                    title={t('tv.title')}
                    description={t('tv.description')}
                />
                <div className="mt-4 md:mt-0">
                    <DeviceNameEditor />
                </div>
            </div>

            {loading && visible.length === 0 ? (
                <p className="text-ink-2 text-sm">{t('tv.searching')}</p>
            ) : visible.length === 0 ? (
                <EmptyState
                    icon={Radio}
                    title={t('tv.noActiveTitle')}
                    description={t('tv.noActiveDesc')}
                    action={<Button variant="ghost" onClick={refresh}>{t('tv.refresh')}</Button>}
                />
            ) : (
                <CardGrid base={1} sm={2} lg={3} gap={4}>
                    {visible.map((s) => (
                        <SessionCard key={s.deviceId} session={s} now={now} onSelect={setSelected} />
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
