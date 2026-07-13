import { NextResponse } from 'next/server';
import { enforceRemoteAccessForApi } from '@/app/lib/remoteAccess';
import {
    endSession,
    listActiveSessions,
    upsertSession,
    HEARTBEAT_MS,
    type ShareContentType,
} from '@/app/lib/liveShare';

export const runtime = 'nodejs';

const VALID_TYPES: ShareContentType[] = ['live', 'movie', 'series'];

/** Accepts only a valid IPv4 (normalizes the IPv6-mapped ::ffff:x form). */
function sanitizeIp(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const cleaned = value.replace(/^::ffff:/i, '').trim();
    const match = /^(\d{1,3})(\.\d{1,3}){3}$/.exec(cleaned);
    if (!match) return undefined;
    if (cleaned.split('.').some((oct) => Number(oct) > 255)) return undefined;
    return cleaned;
}

export async function GET(request: Request) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    const sessions = await listActiveSessions();
    return NextResponse.json({ sessions, heartbeatMs: HEARTBEAT_MS });
}

export async function POST(request: Request) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    const body = await request.json().catch(() => null);
    if (!body) {
        return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 });
    }

    const { deviceId, deviceName, contentType, streamId, title, poster, ip, ext, seriesId } = body;

    if (!deviceId || !deviceName || !streamId || !title || !VALID_TYPES.includes(contentType)) {
        return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 });
    }

    // Prefer the IP discovered on the client (WebRTC); otherwise the proxy header.
    const headerIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
        || request.headers.get('x-real-ip')
        || undefined;
    const resolvedIp = sanitizeIp(ip) || sanitizeIp(headerIp);

    const session = await upsertSession({
        deviceId: String(deviceId),
        deviceName: String(deviceName),
        contentType,
        streamId: String(streamId),
        title: String(title),
        poster: poster ? String(poster) : undefined,
        ext: ext ? String(ext).replace(/[^a-z0-9]/gi, '').slice(0, 5) : undefined,
        seriesId: seriesId ? String(seriesId) : undefined,
        ip: resolvedIp,
    });

    return NextResponse.json({ session });
}

export async function DELETE(request: Request) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId');
    if (!deviceId) {
        return NextResponse.json({ error: 'deviceId ausente' }, { status: 400 });
    }

    await endSession(deviceId);
    return NextResponse.json({ success: true });
}
