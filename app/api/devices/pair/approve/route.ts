import { NextRequest, NextResponse } from 'next/server';
import { enforceRemoteAccessForApi } from '@/app/lib/remoteAccess';
import { getRequestDevice } from '@/app/lib/apiAuth';
import { approvePairingCode } from '@/app/lib/deviceStore';
import { listProfiles } from '@/app/lib/userStore';
import { translateForRequest } from '@/app/lib/i18n';

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
export async function POST(request: NextRequest) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    if (getRequestDevice(request)) {
        return NextResponse.json({ error: translateForRequest(request, 'serverErrors.pairedCannotApprove') }, { status: 403 });
    }

    try {
        const body = await request.json().catch(() => ({})) as PairApproveRequestBody;
        const code = body.code?.trim().toUpperCase();

        if (!code) {
            return NextResponse.json({ error: translateForRequest(request, 'serverErrors.codeRequired') }, { status: 400 });
        }

        const profileId = body.profileId?.trim() || null;

        if (profileId && !listProfiles().some(profile => profile.id === profileId)) {
            return NextResponse.json({ error: translateForRequest(request, 'serverErrors.profileNotFound') }, { status: 400 });
        }

        const device = approvePairingCode(code, body.name, profileId);

        if (!device) {
            return NextResponse.json({ error: translateForRequest(request, 'serverErrors.invalidCode') }, { status: 404 });
        }

        return NextResponse.json({ success: true, device });
    } catch (error) {
        console.error('[Devices] Failed to approve pairing', error);
        return NextResponse.json({ error: 'Falha ao aprovar o pareamento' }, { status: 500 });
    }
}
