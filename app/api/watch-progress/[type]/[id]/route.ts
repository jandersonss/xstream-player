import { NextResponse } from 'next/server';
import { enforceRemoteAccessForApi } from '@/app/lib/remoteAccess';
import { getProgressDetail, saveProgress, resolveProfileId, WatchProgress } from '@/app/lib/userStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ type: string; id: string }> }
) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    try {
        const { type, id } = await params;
        const detail = getProgressDetail(resolveProfileId(request), type, id);

        // The client expects a map for series and the bare object for movies;
        // an empty object when there is nothing stored.
        return NextResponse.json(detail ?? {});
    } catch (error) {
        console.error('[WatchProgress] Failed to read granular progress', error);
        return NextResponse.json({ error: 'Failed to read granular progress' }, { status: 500 });
    }
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ type: string; id: string }> }
) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    try {
        await params;
        const progress = await request.json() as WatchProgress;
        if (!progress || typeof progress.timestamp !== 'number') {
            return NextResponse.json({ error: 'Progresso inválido' }, { status: 400 });
        }

        // The row is keyed by the progress payload itself, so the URL params are
        // only the addressing scheme the client already uses.
        saveProgress(resolveProfileId(request), progress);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[WatchProgress] Failed to save granular progress', error);
        return NextResponse.json({ error: 'Failed to save granular progress' }, { status: 500 });
    }
}
