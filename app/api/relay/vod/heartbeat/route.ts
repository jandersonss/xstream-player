import { NextResponse } from 'next/server';
import { enforceRemoteAccessForApi } from '@/app/lib/remoteAccess';
import { reportConsumer, type ConsumerState } from '@/app/lib/vodBroadcast';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STATES: ConsumerState[] = ['playing', 'paused', 'stalled'];
/** Broadcast key produced by `keyFor` in vodBroadcast (`movie_123` / `series_456`). */
const KEY_PATTERN = /^(movie|series)_\d+$/;

interface HeartbeatRequestBody {
    key?: unknown;
    deviceId?: unknown;
    state?: unknown;
}

/**
 * Playback heartbeat of the VOD relay: keeps the broadcast alive only while some
 * device is actually playing it. Reading segments does not extend the lifetime —
 * a player stuck on DEMUXER_ERROR keeps downloading and must not hold the stream.
 */
export async function POST(request: Request) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    try {
        const body = (await request.json().catch(() => null)) as HeartbeatRequestBody | null;
        if (!body) {
            return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 });
        }

        const key = String(body.key ?? '');
        const deviceId = String(body.deviceId ?? '');
        const state = body.state as ConsumerState;

        if (!KEY_PATTERN.test(key) || !deviceId || !VALID_STATES.includes(state)) {
            return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
        }

        return NextResponse.json({ alive: reportConsumer(key, deviceId, state) });
    } catch (error) {
        console.error('[VodHeartbeat] Falha ao registrar reprodução', error);
        return NextResponse.json({ error: 'Falha ao registrar reprodução' }, { status: 500 });
    }
}
