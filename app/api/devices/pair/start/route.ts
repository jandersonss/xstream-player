import { NextResponse } from 'next/server';
import { enforceRemoteAccessForApi } from '@/app/lib/remoteAccess';
import { createPairingCode, normalizePlatform } from '@/app/lib/deviceStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PairStartRequestBody {
    deviceName?: string;
    platform?: string;
}

const MAX_NAME_LENGTH = 64;

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 10;

/**
 * In-memory rate limit, on purpose: it guards a LAN-only endpoint against a runaway
 * client or a bored guest, not against a distributed attacker. Keeping it out of SQLite
 * avoids a write on every attempt, and losing the counters on restart costs nothing —
 * the real protection is that a code is worthless until the owner types it in.
 */
const attemptsByIp = new Map<string, number[]>();

function getClientIp(request: Request): string {
    const forwarded = request.headers.get('x-forwarded-for');
    return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

function consumeRateLimit(request: Request): boolean {
    const ip = getClientIp(request);
    const now = Date.now();
    const recent = (attemptsByIp.get(ip) ?? []).filter(timestamp => timestamp > now - RATE_LIMIT_WINDOW_MS);

    if (recent.length >= RATE_LIMIT_MAX) {
        attemptsByIp.set(ip, recent);
        return false;
    }

    recent.push(now);
    attemptsByIp.set(ip, recent);

    // Drop idle buckets so the map cannot grow without bound.
    for (const [key, timestamps] of attemptsByIp) {
        if (timestamps.every(timestamp => timestamp <= now - RATE_LIMIT_WINDOW_MS)) {
            attemptsByIp.delete(key);
        }
    }

    return true;
}

/**
 * Public within the remote-access rules: this is the flow that hands out the very first
 * credential, so it cannot demand one. What protects it is the code itself — 6 chars,
 * 5 minutes, single use, redeemable only by the owner on the server UI — plus the rate limit.
 */
export async function POST(request: Request) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    try {
        if (!consumeRateLimit(request)) {
            return NextResponse.json({ error: 'Muitas tentativas. Aguarde um minuto.' }, { status: 429 });
        }

        const body = await request.json().catch(() => ({})) as PairStartRequestBody;
        const deviceName = body.deviceName?.trim().slice(0, MAX_NAME_LENGTH) || 'TV';

        return NextResponse.json(createPairingCode(deviceName, normalizePlatform(body.platform)));
    } catch (error) {
        console.error('[Devices] Failed to start pairing', error);
        return NextResponse.json({ error: 'Falha ao iniciar o pareamento' }, { status: 500 });
    }
}
