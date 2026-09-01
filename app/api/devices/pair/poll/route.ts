import { NextResponse } from 'next/server';
import { enforceRemoteAccessForApi } from '@/app/lib/remoteAccess';
import { consumePairing } from '@/app/lib/deviceStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PairPollRequestBody {
    pairingId?: string;
}

/**
 * The TV polls here while the owner types the code. The poll that finds the pairing
 * approved is the one and only delivery of the plaintext token — the store drops it in
 * the same transaction, so a replay gets `expired`.
 */
export async function POST(request: Request) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    try {
        const body = await request.json().catch(() => ({})) as PairPollRequestBody;
        const pairingId = body.pairingId?.trim();

        if (!pairingId) {
            return NextResponse.json({ error: 'pairingId é obrigatório' }, { status: 400 });
        }

        return NextResponse.json(consumePairing(pairingId));
    } catch (error) {
        console.error('[Devices] Failed to poll pairing', error);
        return NextResponse.json({ error: 'Falha ao consultar o pareamento' }, { status: 500 });
    }
}
