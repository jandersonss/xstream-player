import { NextResponse } from 'next/server';
import { enforceApiAccess } from '@/app/lib/apiAuth';
import {
    reportParticipant,
    setSyncCommand,
    getSyncState,
    type SyncRole,
} from '@/app/lib/tvModeStore';

export const runtime = 'nodejs';

const VALID_ROLES: SyncRole[] = ['broadcaster', 'viewer'];

/** Sanitized live latency (0..3600s); discards absurd/NaN values. */
function sanitizeLatency(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, 3600);
}

/**
 * Absolute instant from the playlist (EXT-X-PROGRAM-DATE-TIME, ms). Absent on streams
 * without the tag, so anything unusable becomes null and the caller falls back to latency.
 */
function sanitizeMediaTime(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(request: Request) {
    const accessResponse = await enforceApiAccess(request);
    if (accessResponse) return accessResponse;

    const { searchParams } = new URL(request.url);
    const streamKey = searchParams.get('streamKey');
    if (!streamKey) {
        return NextResponse.json({ error: 'streamKey ausente' }, { status: 400 });
    }
    return NextResponse.json(getSyncState(streamKey));
}

export async function POST(request: Request) {
    const accessResponse = await enforceApiAccess(request);
    if (accessResponse) return accessResponse;

    const body = await request.json().catch(() => null);
    if (!body || typeof body.streamKey !== 'string') {
        return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 });
    }

    // Broadcaster command: "sync everyone" to the target latency.
    if (body.command) {
        const state = setSyncCommand(
            body.streamKey,
            sanitizeLatency(body.targetLatency),
            sanitizeMediaTime(body.targetMediaTime)
        );
        return NextResponse.json(state);
    }

    // Latency heartbeat from a participant.
    if (typeof body.deviceId !== 'string' || !VALID_ROLES.includes(body.role)) {
        return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 });
    }
    const state = reportParticipant(
        body.streamKey,
        body.deviceId,
        body.role,
        sanitizeLatency(body.latency),
        sanitizeMediaTime(body.mediaTime)
    );
    return NextResponse.json(state);
}
