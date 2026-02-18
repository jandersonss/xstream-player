import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const SUBTITLES_DIR = path.join(process.cwd(), 'data', 'subtitles');

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const streamId = searchParams.get('streamId');

        if (!streamId) {
            return NextResponse.json({ error: 'streamId is required' }, { status: 400 });
        }

        const filePath = path.join(SUBTITLES_DIR, `subtitle-${streamId}.json`);

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
    try {
        const body = await request.json();
        const { streamId, vtt, language } = body;

        if (!streamId || !vtt) {
            return NextResponse.json({ error: 'streamId and vtt are required' }, { status: 400 });
        }

        // Ensure directory exists
        await fs.mkdir(SUBTITLES_DIR, { recursive: true });

        const filePath = path.join(SUBTITLES_DIR, `subtitle-${streamId}.json`);
        const subtitleData = {
            streamId,
            vtt,
            language: language || 'pt-BR',
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
    try {
        const { searchParams } = new URL(request.url);
        const streamId = searchParams.get('streamId');

        if (!streamId) {
            return NextResponse.json({ error: 'streamId is required' }, { status: 400 });
        }

        const filePath = path.join(SUBTITLES_DIR, `subtitle-${streamId}.json`);

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
