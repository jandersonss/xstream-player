import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const PROGRESS_PATH = path.join(process.cwd(), 'data', 'watch-progress.json');

export async function GET() {
    try {
        const data = await fs.readFile(PROGRESS_PATH, 'utf-8');
        return NextResponse.json(JSON.parse(data));
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            return NextResponse.json({});
        }
        return NextResponse.json({ error: 'Failed to read watch progress' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        // Ensure data directory exists
        await fs.mkdir(path.dirname(PROGRESS_PATH), { recursive: true });
        await fs.writeFile(PROGRESS_PATH, JSON.stringify(body, null, 2));
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to save watch progress' }, { status: 500 });
    }
}
