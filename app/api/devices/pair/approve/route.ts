import { NextResponse } from 'next/server';
import { enforceRemoteAccessForApi } from '@/app/lib/remoteAccess';
import { getRequestDevice } from '@/app/lib/apiAuth';
import { approvePairingCode } from '@/app/lib/deviceStore';
import { listProfiles } from '@/app/lib/userStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PairApproveRequestBody {
    code?: string;
    name?: string;
    profileId?: string | null;
}

/**
 * Owner-only: enrolling a device is never something another device may do, so this route
 * stays on the remote-access guard and refuses outright when a device Bearer token is
 * presented — otherwise a paired TV could quietly enroll a second one.
 */
export async function POST(request: Request) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    if (getRequestDevice(request)) {
        return NextResponse.json({ error: 'Um aparelho pareado não pode aprovar outro' }, { status: 403 });
    }

    try {
        const body = await request.json().catch(() => ({})) as PairApproveRequestBody;
        const code = body.code?.trim().toUpperCase();

        if (!code) {
            return NextResponse.json({ error: 'Código é obrigatório' }, { status: 400 });
        }

        const profileId = body.profileId?.trim() || null;

        if (profileId && !listProfiles().some(profile => profile.id === profileId)) {
            return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 400 });
        }

        const device = approvePairingCode(code, body.name, profileId);

        if (!device) {
            return NextResponse.json({ error: 'Código inválido ou expirado' }, { status: 404 });
        }

        return NextResponse.json({ success: true, device });
    } catch (error) {
        console.error('[Devices] Failed to approve pairing', error);
        return NextResponse.json({ error: 'Falha ao aprovar o pareamento' }, { status: 500 });
    }
}
