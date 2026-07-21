import { NextResponse } from 'next/server';
import { enforceRemoteAccessForApi } from '@/app/lib/remoteAccess';
import { killBroadcast } from '@/app/lib/vodBroadcast';
import { stopDevice } from '@/app/lib/tvModeStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VOD_TYPES = ['movie', 'series'];

/**
 * Forced stop of a broadcast, from the TV Mode screen. Kills the ffmpeg process (VOD)
 * and marks the broadcasting device, so its heartbeat stops re-registering the session.
 * Any device on the network may do it: the network is private, the app has no auth, and
 * limiting it to the broadcaster would rule out the very case this exists for — the
 * device left paused and forgotten.
 */
export async function DELETE(request: Request) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    try {
        const { searchParams } = new URL(request.url);
        const deviceId = searchParams.get('deviceId');
        const contentType = searchParams.get('contentType') ?? '';
        const streamId = searchParams.get('streamId') ?? '';

        if (!deviceId) {
            return NextResponse.json({ error: 'deviceId ausente' }, { status: 400 });
        }

        // Live channels have no ffmpeg behind them (the live relay is just a cache).
        if (VOD_TYPES.includes(contentType) && /^\d+$/.test(streamId)) {
            killBroadcast(`${contentType}_${streamId}`);
        }

        stopDevice(deviceId);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[VodBroadcast] Falha ao encerrar transmissão', error);
        return NextResponse.json({ error: 'Falha ao encerrar transmissão' }, { status: 500 });
    }
}
