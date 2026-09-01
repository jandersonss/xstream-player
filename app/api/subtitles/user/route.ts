import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { enforceApiAccess } from '@/app/lib/apiAuth';
import { DEFAULT_SUBTITLE_LANGUAGE, resolveSubtitlePath } from '@/app/lib/subtitleStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const accessResponse = await enforceApiAccess(request);
    if (accessResponse) return accessResponse;

    try {
        const { searchParams } = new URL(request.url);
        const streamId = searchParams.get('streamId');
        const language = searchParams.get('language') || DEFAULT_SUBTITLE_LANGUAGE;

        if (!streamId) {
            return NextResponse.json({ error: 'streamId is required' }, { status: 400 });
        }

        const filePath = resolveSubtitlePath(streamId, language);
        if (!filePath) {
            return NextResponse.json({ error: 'Invalid streamId or language' }, { status: 400 });
        }

        try {
            const data = await fs.readFile(filePath, 'utf-8');
            return NextResponse.json(JSON.parse(data));
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return NextResponse.json(null);
            }
            throw error;
        }
    } catch (error: any) {
        console.error('[Subtitles/User] GET error:', error);
        return NextResponse.json({ error: 'Failed to read subtitle' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const accessResponse = await enforceApiAccess(request);
    if (accessResponse) return accessResponse;

    try {
        const body = await request.json();
        const { streamId, vtt } = body;
        const language = body.language || DEFAULT_SUBTITLE_LANGUAGE;

        if (!streamId || !vtt) {
            return NextResponse.json({ error: 'streamId and vtt are required' }, { status: 400 });
        }

        const filePath = resolveSubtitlePath(String(streamId), String(language));
        if (!filePath) {
            return NextResponse.json({ error: 'Invalid streamId or language' }, { status: 400 });
        }

        await fs.mkdir(path.dirname(filePath), { recursive: true });

        const subtitleData = {
            streamId,
            vtt,
            language,
            timestamp: Date.now()
        };

        await fs.writeFile(filePath, JSON.stringify(subtitleData, null, 2));

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[Subtitles/User] POST error:', error);
        return NextResponse.json({ error: 'Failed to save subtitle' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    const accessResponse = await enforceApiAccess(request);
    if (accessResponse) return accessResponse;

    try {
        const { searchParams } = new URL(request.url);
        const streamId = searchParams.get('streamId');
        const language = searchParams.get('language') || DEFAULT_SUBTITLE_LANGUAGE;

        if (!streamId) {
            return NextResponse.json({ error: 'streamId is required' }, { status: 400 });
        }

        const filePath = resolveSubtitlePath(streamId, language);
        if (!filePath) {
            return NextResponse.json({ error: 'Invalid streamId or language' }, { status: 400 });
        }

        try {
            await fs.unlink(filePath);
            return NextResponse.json({ success: true });
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return NextResponse.json({ success: true }); // Already deleted
            }
            throw error;
        }
    } catch (error: any) {
        console.error('[Subtitles/User] DELETE error:', error);
        return NextResponse.json({ error: 'Failed to delete subtitle' }, { status: 500 });
    }
}
