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
    /** Extensão do arquivo VOD (mp4/mkv…), necessária para iniciar o relay do VOD. */
    ext?: string;
    /** Para séries: id da série (streamId é o id do episódio) — usado para montar o link de entrar. */
    seriesId?: string;
    /** IP de LAN do aparelho (best-effort), quando descoberto. */
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

/** URL de reprodução via relay (live ou VOD), na mesma origem do app. */
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

/** Rota do app para ENTRAR numa transmissão (Modo TV / modal de limite). */
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
    // série: streamId é o episódio; precisa do seriesId na rota
    q.set('episode', session.streamId);
    return `/dashboard/watch/series/${session.seriesId ?? ''}?${q.toString()}`;
}

/**
 * Enquanto `enabled` for true, mantém a transmissão do aparelho registrada no
 * servidor (heartbeat periódico) e a encerra ao sair.
 */
export function useShareBroadcast(enabled: boolean, info: BroadcastInfo | null) {
    const streamKey = info ? `${info.contentType}:${info.streamId}` : '';
    const ipRef = useRef<string | null>(null);

    // Descobre o IP de LAN uma única vez (best-effort) para enriquecer o registro.
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

        const beat = async () => {
            try {
                await fetch('/api/live-sessions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deviceId, deviceName, ip: ipRef.current ?? undefined, ...info }),
                });
            } catch {
                /* heartbeat é best-effort */
            }
        };

        beat();
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

/** Busca periodicamente as transmissões ativas (aparelhos compartilhando agora). */
export function useLiveSessions(pollMs = 10 * 1000) {
    const [sessions, setSessions] = useState<ShareSession[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch('/api/live-sessions');
            const data = await res.json();
            setSessions(Array.isArray(data.sessions) ? data.sessions : []);
        } catch {
            /* mantém a lista anterior */
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

/** Excludes minha própria transmissão da lista (não faz sentido "entrar" no que eu mesmo transmito). */
export function excludeSelf(sessions: ShareSession[]): ShareSession[] {
    const myId = getDeviceId();
    return sessions.filter((s) => s.deviceId !== myId);
}

// ---------------------------------------------------------------------------
// Sincronização de tempo entre players (transmissor + espectadores no Modo TV)
// ---------------------------------------------------------------------------

export type SyncRole = 'broadcaster' | 'viewer';

/** Chave comum entre transmissor e espectadores do mesmo conteúdo. */
export function syncKey(contentType: ShareContentType, streamId: string): string {
    return `${contentType}:${streamId}`;
}

/** Cadência de heartbeat/poll da sincronização (posições mudam devagar). */
const SYNC_TICK_MS = 4000;
/** Diferença de latência (s) a partir da qual consideramos os players dessincronizados. */
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

/** Latência ao vivo: distância (s) da posição atual até a borda ao vivo (seekable.end). */
function measureLatency(v: HTMLVideoElement | null): number | null {
    if (!v || v.seekable.length === 0) return null;
    const edge = v.seekable.end(v.seekable.length - 1);
    return Math.max(0, edge - v.currentTime);
}

/** Move o player para ficar `targetLatency` segundos atrás da borda ao vivo. */
function seekToLatency(v: HTMLVideoElement, targetLatency: number) {
    if (v.seekable.length === 0) return;
    const edge = v.seekable.end(v.seekable.length - 1);
    const start = v.seekable.start(0);
    v.currentTime = Math.min(edge, Math.max(start, edge - targetLatency));
}

/**
 * Mantém a latência do player publicada no servidor, observa os demais players do
 * mesmo conteúdo e expõe se há dessincronização (`canSync`) e a ação de sincronizar.
 *
 * - Espectador: `sync()` pula para a latência do transmissor; e ao receber um comando
 *   novo do transmissor, ajusta-se automaticamente (só se estiver fora de sincronia).
 * - Transmissor: `sync()` emite um comando para os espectadores dessincronizados irem
 *   ao seu tempo; o botão só aparece quando algum espectador está fora de sincronia.
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
                lastAppliedEpochRef.current = state.command.epoch; // transmissor só acompanha
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
            // Puxa para a latência atual do transmissor (busca o estado mais fresco).
            try {
                const res = await fetch(`/api/live-sync?streamKey=${encodeURIComponent(streamKey)}`);
                const state = (await res.json()) as SyncStateDTO;
                const broadcaster = state.participants?.find((p) => p.role === 'broadcaster');
                if (broadcaster) seekToLatency(video, broadcaster.latency);
            } catch {
                /* ignore */
            }
        } else {
            // Transmissor: publica um comando com a própria latência para os espectadores.
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
