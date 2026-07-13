import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { enforceRemoteAccessForApi } from '@/app/lib/remoteAccess';

const SUBTITLES_DIR = path.join(process.cwd(), 'data', 'subtitles');

// Lists the streamIds that already have a saved subtitle, so episodes can be
// marked in a single pass (no request per episode).
export async function GET(request: Request) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    try {
        const files = await fs.readdir(SUBTITLES_DIR);
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
