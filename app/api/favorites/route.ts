import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const FAVORITES_PATH = path.join(process.cwd(), 'data', 'favorites.json');

export async function GET() {
    try {
        const data = await fs.readFile(FAVORITES_PATH, 'utf-8');
        return NextResponse.json(JSON.parse(data));
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            return NextResponse.json([]);
        }
        return NextResponse.json({ error: 'Failed to read favorites' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        // Ensure data directory exists
        await fs.mkdir(path.dirname(FAVORITES_PATH), { recursive: true });
        await fs.writeFile(FAVORITES_PATH, JSON.stringify(body, null, 2));
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to save favorites' }, { status: 500 });
    }
}
