import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'data', 'config.json');

export async function GET() {
    try {
        const data = await fs.readFile(CONFIG_PATH, 'utf-8');
        return NextResponse.json(JSON.parse(data));
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            return NextResponse.json({});
        }
        return NextResponse.json({ error: 'Failed to read config' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        await fs.writeFile(CONFIG_PATH, JSON.stringify(body, null, 2));
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to save config' }, { status: 500 });
    }
}
