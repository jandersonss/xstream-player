import { NextResponse } from 'next/server';
import { enforceRemoteAccessForApi } from '@/app/lib/remoteAccess';
import { getRequestDevice } from '@/app/lib/apiAuth';
import { listDevices, revokeDevice, updateDevice } from '@/app/lib/deviceStore';
import { listProfiles } from '@/app/lib/userStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DevicePatchRequestBody {
    id?: string;
    name?: string;
    profileId?: string | null;
}

interface DeviceDeleteRequestBody {
    id?: string;
}

/**
 * Owner-only, like the approval route: managing the device list is the server owner's
 * job, so a device Bearer token is refused rather than accepted.
 */
async function guardOwner(request: Request): Promise<NextResponse | null> {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    if (getRequestDevice(request)) {
        return NextResponse.json({ error: 'Um aparelho pareado não pode gerenciar outros' }, { status: 403 });
    }

    return null;
}

export async function GET(request: Request) {
    const denied = await guardOwner(request);
    if (denied) return denied;

    try {
        return NextResponse.json({ data: listDevices() });
    } catch (error) {
        console.error('[Devices] Failed to list devices', error);
        return NextResponse.json({ error: 'Falha ao carregar aparelhos' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    const denied = await guardOwner(request);
    if (denied) return denied;

    try {
        const body = await request.json().catch(() => ({})) as DevicePatchRequestBody;

        if (!body.id) {
            return NextResponse.json({ error: 'ID do aparelho é obrigatório' }, { status: 400 });
        }

        const name = body.name?.trim();

        if (body.name !== undefined && !name) {
            return NextResponse.json({ error: 'Nome do aparelho é obrigatório' }, { status: 400 });
        }

        // `null` is meaningful here (back to "first profile"), `undefined` means "unchanged".
        const profileId = body.profileId === undefined ? undefined : (body.profileId?.trim() || null);

        if (profileId && !listProfiles().some(profile => profile.id === profileId)) {
            return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 400 });
        }

        const changes: { name?: string; profileId?: string | null } = {};
        if (name) changes.name = name;
        if (profileId !== undefined) changes.profileId = profileId;

        if (!updateDevice(body.id, changes)) {
            return NextResponse.json({ error: 'Aparelho não encontrado' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Devices] Failed to update device', error);
        return NextResponse.json({ error: 'Falha ao atualizar o aparelho' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    const denied = await guardOwner(request);
    if (denied) return denied;

    try {
        const body = await request.json().catch(() => ({})) as DeviceDeleteRequestBody;

        if (!body.id) {
            return NextResponse.json({ error: 'ID do aparelho é obrigatório' }, { status: 400 });
        }

        if (!revokeDevice(body.id)) {
            return NextResponse.json({ error: 'Aparelho não encontrado' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Devices] Failed to revoke device', error);
        return NextResponse.json({ error: 'Falha ao revogar o aparelho' }, { status: 500 });
    }
}
