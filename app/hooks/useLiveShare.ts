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
