import { NextResponse } from 'next/server';
import { enforceRemoteAccessForApi } from '@/app/lib/remoteAccess';
import {
    reportParticipant,
    setSyncCommand,
    getSyncState,
    type SyncRole,
} from '@/app/lib/syncStore';

export const runtime = 'nodejs';

const VALID_ROLES: SyncRole[] = ['broadcaster', 'viewer'];

/** Sanitized live latency (0..3600s); discards absurd/NaN values. */
function sanitizeLatency(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, 3600);
}

export async function GET(request: Request) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    const { searchParams } = new URL(request.url);
    const streamKey = searchParams.get('streamKey');
    if (!streamKey) {
        return NextResponse.json({ error: 'streamKey ausente' }, { status: 400 });
    }
    return NextResponse.json(await getSyncState(streamKey));
}

export async function POST(request: Request) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    const body = await request.json().catch(() => null);
    if (!body || typeof body.streamKey !== 'string') {
        return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 });
    }

    // Broadcaster command: "sync everyone" to the target latency.
    if (body.command) {
        const state = await setSyncCommand(body.streamKey, sanitizeLatency(body.targetLatency));
        return NextResponse.json(state);
    }

    // Latency heartbeat from a participant.
    if (typeof body.deviceId !== 'string' || !VALID_ROLES.includes(body.role)) {
        return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 });
    }
    const state = await reportParticipant(
        body.streamKey,
        body.deviceId,
        body.role,
        sanitizeLatency(body.latency)
    );
    return NextResponse.json(state);
}
