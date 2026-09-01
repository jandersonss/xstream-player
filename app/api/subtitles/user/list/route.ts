import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import { enforceApiAccess } from '@/app/lib/apiAuth';
import { DEFAULT_SUBTITLE_LANGUAGE, subtitleLanguageDir } from '@/app/lib/subtitleStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lists the streamIds that already have a saved subtitle in the requested
// language, so episodes can be marked in a single pass (no request per episode).
export async function GET(request: Request) {
    const accessResponse = await enforceApiAccess(request);
    if (accessResponse) return accessResponse;

    try {
        const { searchParams } = new URL(request.url);
        const language = searchParams.get('language') || DEFAULT_SUBTITLE_LANGUAGE;

        const dir = subtitleLanguageDir(language);
        if (!dir) {
            return NextResponse.json({ error: 'Invalid language' }, { status: 400 });
        }

        const files = await fs.readdir(dir);
        const streamIds = files
            .filter(f => f.startsWith('subtitle-') && f.endsWith('.json'))
            .map(f => f.slice('subtitle-'.length, -'.json'.length));
        return NextResponse.json({ streamIds });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return NextResponse.json({ streamIds: [] });
        }
        console.error('[Subtitles/User] LIST error:', error);
        return NextResponse.json({ error: 'Failed to list subtitles' }, { status: 500 });
    }
}
