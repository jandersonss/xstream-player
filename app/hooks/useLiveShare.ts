'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type Hls from 'hls.js';
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

/**
 * Playback URL through the relay (live or VOD), on the same origin as the app.
 *
 * `start` (seconds) only matters for whoever CREATES the VOD broadcast — the server
 * ignores it when the broadcast already exists, so viewers joining keep landing at
 * whatever point it is playing now.
 */
export function relaySrc(info: {
    contentType: ShareContentType;
    streamId: string;
    ext?: string;
    start?: number;
}): string {
    if (info.contentType === 'live') {
        return `/api/relay?type=live&streamId=${encodeURIComponent(info.streamId)}`;
    }
    const ext = info.ext || 'mp4';
    const start = Math.max(0, Math.floor(info.start ?? 0));
    const startParam = start > 0 ? `&start=${start}` : '';
    return `/api/relay/vod/index.m3u8?type=${info.contentType}&streamId=${encodeURIComponent(info.streamId)}&ext=${encodeURIComponent(ext)}${startParam}`;
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

/**
 * Poll cadence of the sync. This is also how long a viewer waits before even seeing
 * a "sync everyone" command, so it is the floor on how fast the button can feel;
 * the payload is tiny and this only runs on a private network.
 */
const SYNC_TICK_MS = 1000;
/** Latency difference (s) beyond which we consider the players out of sync. */
const SYNC_THRESHOLD_S = 5;

/** Drift this small counts as aligned; chasing it would only churn the playback rate. */
const IN_SYNC_S = 0.3;
/** Past this, nudging the rate would take too long to close the gap — jump instead. */
const SEEK_THRESHOLD_S = 3;
/** A gap is closed over roughly this long, which keeps the rate change gentle. */
const CATCHUP_WINDOW_S = 5;
/** Bound on the rate change; past this the pitch shift starts to be noticeable. */
const MAX_RATE_DELTA = 0.1;

interface SyncParticipantDTO {
    deviceId: string;
    role: SyncRole;
    latency: number;
    /** Absolute instant of the frame being shown (from the playlist), or null. */
    mediaTime: number | null;
    /** How long ago the server received this reading. */
    ageMs: number;
}
interface SyncStateDTO {
    participants: SyncParticipantDTO[];
    command?: { epoch: number; targetLatency: number; targetMediaTime: number | null };
}

/** Live latency: distance (s) from the current position to the live edge (seekable.end). */
function measureLatency(v: HTMLVideoElement | null): number | null {
    if (!v || v.seekable.length === 0) return null;
    const edge = v.seekable.end(v.seekable.length - 1);
    return Math.max(0, edge - v.currentTime);
}

/**
 * The instant of the broadcast currently on screen, in ms.
 *
 * This is the whole point of the absolute clock: it comes from the playlist, so it means
 * the same thing on every device. `latency` cannot, because each player measures it
 * against the live edge as its own last playlist refresh reported it.
 */
function measureMediaTime(hls: Hls | null): number | null {
    const date = hls?.playingDate;
    return date ? date.getTime() : null;
}

/** Moves the player to sit `targetLatency` seconds behind the live edge. */
function seekToLatency(v: HTMLVideoElement, targetLatency: number) {
    if (v.seekable.length === 0) return;
    const edge = v.seekable.end(v.seekable.length - 1);
    const start = v.seekable.start(0);
    v.currentTime = Math.min(edge, Math.max(start, edge - targetLatency));
}

/**
 * Closes a measured drift (positive = the player is behind and must catch up).
 *
 * Small gaps are absorbed by playing slightly faster or slower, which is invisible;
 * seeking would flush the buffer and stall the picture for seconds, and that stall is
 * what made syncing feel slow even once the command arrived quickly.
 */
function applyDrift(v: HTMLVideoElement, driftSeconds: number) {
    const drift = Math.abs(driftSeconds);

    if (drift > SEEK_THRESHOLD_S) {
        if (v.playbackRate !== 1) v.playbackRate = 1;
        const target = v.currentTime + driftSeconds;
        if (v.seekable.length > 0) {
            const start = v.seekable.start(0);
            const end = v.seekable.end(v.seekable.length - 1);
            v.currentTime = Math.min(end, Math.max(start, target));
        } else {
            v.currentTime = target;
        }
        return;
    }

    if (drift < IN_SYNC_S) {
        if (v.playbackRate !== 1) v.playbackRate = 1;
        return;
    }

    const adjustment = Math.max(
        -MAX_RATE_DELTA,
        Math.min(MAX_RATE_DELTA, driftSeconds / CATCHUP_WINDOW_S)
    );
    v.playbackRate = 1 + adjustment;
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
    /** hls.js instance of the same player — carries the broadcast's absolute clock. */
    hls?: Hls | null;
    streamKey: string | null;
    role: SyncRole;
    active: boolean;
}) {
    const { videoEl, hls, streamKey, role, active } = opts;
    const [canSync, setCanSync] = useState(false);
    const videoRef = useRef(videoEl);
    const hlsRef = useRef(hls ?? null);
    const lastAppliedEpochRef = useRef(0);

    useEffect(() => { videoRef.current = videoEl; }, [videoEl]);
    useEffect(() => { hlsRef.current = hls ?? null; }, [hls]);

    /**
     * Where the broadcaster is right now, on the shared clock. The reading aged on the
     * server while it waited to be collected, and the broadcaster kept playing during
     * that time, so the age has to be added back. The server measures it, since
     * comparing its timestamp against this device's clock would fold in their skew.
     */
    const broadcasterMediaTime = (p: SyncParticipantDTO | undefined): number | null =>
        p && p.mediaTime !== null ? p.mediaTime + p.ageMs : null;

    useEffect(() => {
        if (!active || !streamKey) return;
        const deviceId = getDeviceId();
        let cancelled = false;

        const applyState = (
            state: SyncStateDTO,
            myLatency: number | null,
            myMediaTime: number | null
        ) => {
            const broadcaster = state.participants.find((p) => p.role === 'broadcaster');
            const video = videoRef.current;
            const targetMediaTime = broadcasterMediaTime(broadcaster);
            const drift =
                myMediaTime !== null && targetMediaTime !== null
                    ? (targetMediaTime - myMediaTime) / 1000
                    : null;

            // With the shared clock a viewer corrects itself continuously, so the players
            // stay together instead of drifting until someone presses the button.
            if (role === 'viewer' && video && drift !== null) {
                applyDrift(video, drift);
            }

            // Without it, all we have is the broadcaster's command and its own latency.
            if (drift === null && state.command && state.command.epoch > lastAppliedEpochRef.current) {
                lastAppliedEpochRef.current = state.command.epoch;
                if (
                    role === 'viewer'
                    && video
                    && myLatency !== null
                    && Math.abs(myLatency - state.command.targetLatency) > SYNC_THRESHOLD_S
                ) {
                    seekToLatency(video, state.command.targetLatency);
                }
            }

            let show = false;
            if (drift !== null) {
                // Only worth offering while the automatic correction has not caught up.
                show = role === 'viewer'
                    ? Math.abs(drift) > SYNC_THRESHOLD_S
                    : state.participants.some(
                        (p) => p.role === 'viewer'
                            && p.mediaTime !== null
                            && myMediaTime !== null
                            && Math.abs((p.mediaTime + p.ageMs - myMediaTime) / 1000) > SYNC_THRESHOLD_S
                    );
            } else if (myLatency !== null) {
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
            const myMediaTime = measureMediaTime(hlsRef.current);
            try {
                const res = await fetch('/api/live-sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        streamKey,
                        deviceId,
                        role,
                        latency: myLatency ?? 0,
                        mediaTime: myMediaTime,
                    }),
                });
                const state = (await res.json()) as SyncStateDTO;
                if (!cancelled && Array.isArray(state.participants)) {
                    applyState(state, myLatency, myMediaTime);
                }
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
            // Never leave the player running off-speed once syncing stops.
            const video = videoRef.current;
            if (video && video.playbackRate !== 1) video.playbackRate = 1;
        };
    }, [active, streamKey, role]);

    const sync = useCallback(async () => {
        const video = videoRef.current;
        if (!video || !streamKey) return;

        if (role === 'viewer') {
            // Pull to where the broadcaster is (fetch the freshest state).
            try {
                const res = await fetch(`/api/live-sync?streamKey=${encodeURIComponent(streamKey)}`);
                const state = (await res.json()) as SyncStateDTO;
                const broadcaster = state.participants?.find((p) => p.role === 'broadcaster');
                const targetMediaTime = broadcasterMediaTime(broadcaster);
                const myMediaTime = measureMediaTime(hlsRef.current);

                if (targetMediaTime !== null && myMediaTime !== null) {
                    applyDrift(video, (targetMediaTime - myMediaTime) / 1000);
                } else if (broadcaster) {
                    seekToLatency(video, broadcaster.latency);
                }
            } catch {
                /* ignore */
            }
        } else {
            // Broadcaster: publish a command for viewers without the shared clock.
            const myLatency = measureLatency(video);
            if (myLatency === null) return;
            fetch('/api/live-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    streamKey,
                    command: true,
                    targetLatency: myLatency,
                    targetMediaTime: measureMediaTime(hlsRef.current),
                }),
            }).catch(() => {});
        }
        setCanSync(false);
    }, [role, streamKey]);

    return { canSync, sync };
}
