import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { enforceRemoteAccessForApi } from '@/app/lib/remoteAccess';

const FAVORITES_PATH = path.join(process.cwd(), 'data', 'favorites.json');

export async function GET(request: Request) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

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
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

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
