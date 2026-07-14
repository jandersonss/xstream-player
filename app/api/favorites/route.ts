import { NextResponse } from 'next/server';
import { enforceRemoteAccessForApi } from '@/app/lib/remoteAccess';
import { listFavorites, replaceFavorites, resolveProfileId, FavoriteItem } from '@/app/lib/userStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    try {
        return NextResponse.json(listFavorites(resolveProfileId(request)));
    } catch (error) {
        console.error('[Favorites] Failed to read favorites', error);
        return NextResponse.json({ error: 'Failed to read favorites' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    try {
        // The client owns the whole list and posts it after every add/remove.
        const items = await request.json() as FavoriteItem[];
        if (!Array.isArray(items)) {
            return NextResponse.json({ error: 'Lista de favoritos inválida' }, { status: 400 });
        }

        replaceFavorites(resolveProfileId(request), items);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Favorites] Failed to save favorites', error);
        return NextResponse.json({ error: 'Failed to save favorites' }, { status: 500 });
    }
}
