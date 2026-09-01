import { NextResponse } from 'next/server';
import { enforceApiAccess } from '@/app/lib/apiAuth';
import { getProgressSummary, saveProgress, resolveProfileId, WatchProgress } from '@/app/lib/userStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const accessResponse = await enforceApiAccess(request);
    if (accessResponse) return accessResponse;

    try {
        return NextResponse.json(getProgressSummary(resolveProfileId(request)));
    } catch (error) {
        console.error('[WatchProgress] Failed to read watch progress', error);
        return NextResponse.json({ error: 'Failed to read watch progress' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const accessResponse = await enforceApiAccess(request);
    if (accessResponse) return accessResponse;

    try {
        // Bulk sync of the client's whole map. Each entry is upserted on its own,
        // so this no longer rewrites (and can no longer corrupt) a summary file.
        const body = await request.json() as Record<string, WatchProgress>;
        const profileId = resolveProfileId(request);

        for (const progress of Object.values(body)) {
            if (!progress || typeof progress.timestamp !== 'number') continue;
            saveProgress(profileId, progress);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[WatchProgress] Failed to save watch progress', error);
        return NextResponse.json({ error: 'Failed to save watch progress' }, { status: 500 });
    }
}
