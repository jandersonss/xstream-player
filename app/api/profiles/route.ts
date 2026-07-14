import { NextResponse } from 'next/server';
import { enforceRemoteAccessForApi } from '@/app/lib/remoteAccess';
import { listProfiles, createProfile, updateProfile, deleteProfile, ProfilePrefs } from '@/app/lib/userStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Action = 'create' | 'update' | 'delete';

interface ProfilesRequestBody {
    action: Action;
    id?: string;
    name?: string;
    prefs?: Partial<ProfilePrefs>;
}

export async function GET(request: Request) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    try {
        return NextResponse.json({ data: listProfiles() });
    } catch (error) {
        console.error('[Profiles] Failed to list profiles', error);
        return NextResponse.json({ error: 'Falha ao carregar perfis' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    try {
        const body = await request.json() as ProfilesRequestBody;

        switch (body.action) {
            case 'create': {
                const name = body.name?.trim();
                if (!name) {
                    return NextResponse.json({ error: 'Nome do perfil é obrigatório' }, { status: 400 });
                }
                return NextResponse.json({ data: createProfile(name) });
            }

            case 'update': {
                if (!body.id) {
                    return NextResponse.json({ error: 'ID do perfil é obrigatório' }, { status: 400 });
                }
                const name = body.name?.trim();
                if (body.name !== undefined && !name) {
                    return NextResponse.json({ error: 'Nome do perfil é obrigatório' }, { status: 400 });
                }
                const profile = updateProfile(body.id, { name, prefs: body.prefs });
                if (!profile) {
                    return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 });
                }
                return NextResponse.json({ data: profile });
            }

            case 'delete': {
                if (!body.id) {
                    return NextResponse.json({ error: 'ID do perfil é obrigatório' }, { status: 400 });
                }
                if (!deleteProfile(body.id)) {
                    return NextResponse.json(
                        { error: 'Não é possível excluir o último perfil' },
                        { status: 400 }
                    );
                }
                return NextResponse.json({ success: true });
            }

            default:
                return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
        }
    } catch (error) {
        console.error('[Profiles] Failed to update profiles', error);
        return NextResponse.json({ error: 'Falha ao salvar perfil' }, { status: 500 });
    }
}
