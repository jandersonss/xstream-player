'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getDeviceId, getDeviceName, detectLocalIp } from '@/app/lib/device';

/** Intervalo de heartbeat (menor que o TTL de 45s do servidor). */
const HEARTBEAT_MS = 20 * 1000;

export type ShareContentType = 'live' | 'movie' | 'series';

export interface ShareSession {
    deviceId: string;
    deviceName: string;
    contentType: ShareContentType;
    streamId: string;
    title: string;
    poster?: string;
    /** VOD file extension (mp4/mkv…), needed to start the VOD relay. */
    ext?: string;
    /** For series: the series id (streamId is the episode id) — used to build the join link. */
    seriesId?: string;
    /** Device LAN IP (best-effort), when discovered. */
    ip?: string;
    updatedAt: number;
}

export interface BroadcastInfo {
    contentType: ShareContentType;
    streamId: string;
    title: string;
    poster?: string;
    ext?: string;
    seriesId?: string;
}

/** Playback URL through the relay (live or VOD), on the same origin as the app. */
export function relaySrc(info: {
    contentType: ShareContentType;
    streamId: string;
    ext?: string;
}): string {
    if (info.contentType === 'live') {
        return `/api/relay?type=live&streamId=${encodeURIComponent(info.streamId)}`;
    }
    const ext = info.ext || 'mp4';
    return `/api/relay/vod/index.m3u8?type=${info.contentType}&streamId=${encodeURIComponent(info.streamId)}&ext=${encodeURIComponent(ext)}`;
}

/** App route to JOIN a broadcast (TV Mode / limit modal). */
export function joinHref(session: ShareSession): string {
    const q = new URLSearchParams({ join: '1', title: session.title });
    if (session.poster) q.set('poster', session.poster);
    if (session.ext) q.set('ext', session.ext);

    if (session.contentType === 'live') {
        return `/dashboard/watch/live/${session.streamId}?${q.toString()}`;
    }
    if (session.contentType === 'movie') {
        return `/dashboard/watch/movie/${session.streamId}?${q.toString()}`;
    }
    // series: streamId is the episode; the route needs the seriesId
    q.set('episode', session.streamId);
    return `/dashboard/watch/series/${session.seriesId ?? ''}?${q.toString()}`;
}

/**
 * While `enabled` is true, keeps the device broadcast registered on the
 * server (periodic heartbeat) and ends it on unmount.
 *
 * `onStopped` fires when the server refuses the heartbeat because the broadcast was
 * ended from the TV Mode screen. Without honoring that refusal the device would just
 * re-register on the next beat and the stop would be undone.
 */
export function useShareBroadcast(enabled: boolean, info: BroadcastInfo | null, onStopped?: () => void) {
    const streamKey = info ? `${info.contentType}:${info.streamId}` : '';
    const ipRef = useRef<string | null>(null);
    const onStoppedRef = useRef(onStopped);

    useEffect(() => { onStoppedRef.current = onStopped; }, [onStopped]);

    // Discover the LAN IP once (best-effort) to enrich the registration.
    useEffect(() => {
        let active = true;
        detectLocalIp().then((ip) => {
            if (active) ipRef.current = ip;
        });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        if (!enabled || !info) return;

        const deviceId = getDeviceId();
        const deviceName = getDeviceName();
        let cancelled = false;

        // The first beat carries `resume`: the user turned sharing on by hand, which
        // clears any earlier forced stop. Later beats must not, or a stopped device
        // would resurrect itself seconds later.
        const beat = async (resume = false) => {
            try {
                const res = await fetch('/api/live-sessions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deviceId, deviceName, ip: ipRef.current ?? undefined, resume, ...info }),
                });
                if (!cancelled && res.status === 409) {
                    onStoppedRef.current?.();
                }
            } catch {
                /* heartbeat is best-effort */
            }
        };

        beat(true);
        const interval = setInterval(() => {
            if (!cancelled) beat();
        }, HEARTBEAT_MS);

        return () => {
            cancelled = true;
            clearInterval(interval);
            fetch(`/api/live-sessions?deviceId=${encodeURIComponent(deviceId)}`, {
                method: 'DELETE',
                keepalive: true,
            }).catch(() => {});
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, streamKey]);
}

/** Periodically fetches the active broadcasts (devices sharing right now). */
export function useLiveSessions(pollMs = 10 * 1000) {
    const [sessions, setSessions] = useState<ShareSession[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch('/api/live-sessions');
            const data = await res.json();
            setSessions(Array.isArray(data.sessions) ? data.sessions : []);
        } catch {
            /* keep the previous list */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, pollMs);
        return () => clearInterval(interval);
    }, [refresh, pollMs]);

    return { sessions, loading, refresh };
}

/** Excludes my own broadcast from the list (no point "joining" what I broadcast myself). */
export function excludeSelf(sessions: ShareSession[]): ShareSession[] {
    const myId = getDeviceId();
    return sessions.filter((s) => s.deviceId !== myId);
}

// ---------------------------------------------------------------------------
// Time sync between players (broadcaster + viewers in TV Mode)
// ---------------------------------------------------------------------------

export type SyncRole = 'broadcaster' | 'viewer';

/** Shared key between broadcaster and viewers of the same content. */
export function syncKey(contentType: ShareContentType, streamId: string): string {
    return `${contentType}:${streamId}`;
}

/** Heartbeat/poll cadence of the sync (positions change slowly). */
const SYNC_TICK_MS = 4000;
/** Latency difference (s) beyond which we consider the players out of sync. */
const SYNC_THRESHOLD_S = 5;

interface SyncParticipantDTO {
    deviceId: string;
    role: SyncRole;
    latency: number;
}
interface SyncStateDTO {
    participants: SyncParticipantDTO[];
    command?: { epoch: number; targetLatency: number };
}

/** Live latency: distance (s) from the current position to the live edge (seekable.end). */
function measureLatency(v: HTMLVideoElement | null): number | null {
    if (!v || v.seekable.length === 0) return null;
    const edge = v.seekable.end(v.seekable.length - 1);
    return Math.max(0, edge - v.currentTime);
}

/** Moves the player to sit `targetLatency` seconds behind the live edge. */
function seekToLatency(v: HTMLVideoElement, targetLatency: number) {
    if (v.seekable.length === 0) return;
    const edge = v.seekable.end(v.seekable.length - 1);
    const start = v.seekable.start(0);
    v.currentTime = Math.min(edge, Math.max(start, edge - targetLatency));
}

/**
 * Keeps the player latency published to the server, watches the other players of
 * the same content, and exposes whether they are out of sync (`canSync`) and the sync action.
 *
 * - Viewer: `sync()` jumps to the broadcaster latency; and on receiving a new command
 *   from the broadcaster, adjusts automatically (only if out of sync).
 * - Broadcaster: `sync()` emits a command for the out-of-sync viewers to move
 *   to its time; the button only appears when some viewer is out of sync.
 */
export function useSyncPlayback(opts: {
    videoEl: HTMLVideoElement | null;
    streamKey: string | null;
    role: SyncRole;
    active: boolean;
}) {
    const { videoEl, streamKey, role, active } = opts;
    const [canSync, setCanSync] = useState(false);
    const videoRef = useRef(videoEl);
    const lastAppliedEpochRef = useRef(0);

    useEffect(() => { videoRef.current = videoEl; }, [videoEl]);

    useEffect(() => {
        if (!active || !streamKey) return;
        const deviceId = getDeviceId();
        let cancelled = false;

        const applyState = (state: SyncStateDTO, myLatency: number | null) => {
            const broadcaster = state.participants.find((p) => p.role === 'broadcaster');
            const video = videoRef.current;

            // Espectador: aplica o comando "sincronizar todos" (uma vez por epoch).
            if (role === 'viewer' && state.command && state.command.epoch > lastAppliedEpochRef.current) {
                lastAppliedEpochRef.current = state.command.epoch;
                if (video && myLatency !== null && Math.abs(myLatency - state.command.targetLatency) > SYNC_THRESHOLD_S) {
                    seekToLatency(video, state.command.targetLatency);
                }
            } else if (state.command && state.command.epoch > lastAppliedEpochRef.current) {
                lastAppliedEpochRef.current = state.command.epoch; // broadcaster just tracks
            }

            let show = false;
            if (myLatency !== null) {
                if (role === 'viewer') {
                    show = !!broadcaster && Math.abs(myLatency - broadcaster.latency) > SYNC_THRESHOLD_S;
                } else {
                    show = state.participants.some(
                        (p) => p.role === 'viewer' && Math.abs(p.latency - myLatency) > SYNC_THRESHOLD_S
                    );
                }
            }
            if (!cancelled) setCanSync(show);
        };

        const tick = async () => {
            const myLatency = measureLatency(videoRef.current);
            try {
                const res = await fetch('/api/live-sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ streamKey, deviceId, role, latency: myLatency ?? 0 }),
                });
                const state = (await res.json()) as SyncStateDTO;
                if (!cancelled && Array.isArray(state.participants)) applyState(state, myLatency);
            } catch {
                /* best-effort */
            }
        };

        tick();
        const interval = setInterval(tick, SYNC_TICK_MS);
        return () => {
            cancelled = true;
            clearInterval(interval);
            setCanSync(false);
        };
    }, [active, streamKey, role]);

    const sync = useCallback(async () => {
        const video = videoRef.current;
        if (!video || !streamKey) return;

        if (role === 'viewer') {
            // Pull to the broadcaster current latency (fetch the freshest state).
            try {
                const res = await fetch(`/api/live-sync?streamKey=${encodeURIComponent(streamKey)}`);
                const state = (await res.json()) as SyncStateDTO;
                const broadcaster = state.participants?.find((p) => p.role === 'broadcaster');
                if (broadcaster) seekToLatency(video, broadcaster.latency);
            } catch {
                /* ignore */
            }
        } else {
            // Broadcaster: publish a command with its own latency for the viewers.
            const myLatency = measureLatency(video);
            if (myLatency === null) return;
            fetch('/api/live-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ streamKey, command: true, targetLatency: myLatency }),
            }).catch(() => {});
        }
        setCanSync(false);
    }, [role, streamKey]);

    return { canSync, sync };
}
