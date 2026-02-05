import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const CONFIG_DIR = path.join(process.cwd(), 'data');
const CONFIG_FILE = path.join(CONFIG_DIR, 'tmdb-config.json');

interface TMDbConfig {
    apiKey: string;
    updatedAt: string;
}

// Ensure config directory exists
async function ensureConfigDir() {
    try {
        await fs.access(CONFIG_DIR);
    } catch {
        await fs.mkdir(CONFIG_DIR, { recursive: true });
    }
}

// GET - Read TMDb configuration
export async function GET() {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf-8');
        const config: TMDbConfig = JSON.parse(data);

        return NextResponse.json(config);
    } catch (error: any) {
        // Config file doesn't exist or is invalid
        if (error.code === 'ENOENT') {
            return NextResponse.json({ apiKey: null }, { status: 404 });
        }
        return NextResponse.json({ error: 'Failed to read config' }, { status: 500 });
    }
}

// POST - Save TMDb configuration
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { apiKey } = body;

        if (!apiKey || typeof apiKey !== 'string') {
            return NextResponse.json(
                { error: 'API key is required' },
                { status: 400 }
            );
        }

        // Validate API key by making a test request
        const testResponse = await fetch(
            `https://api.themoviedb.org/3/configuration?api_key=${apiKey}`
        );

        if (!testResponse.ok) {
            return NextResponse.json(
                { error: 'Invalid API key' },
                { status: 400 }
            );
        }

        await ensureConfigDir();

        const config: TMDbConfig = {
            apiKey,
            updatedAt: new Date().toISOString()
        };

        await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));

        return NextResponse.json({ success: true, config });
    } catch (error) {
        console.error('Error saving TMDb config:', error);
        return NextResponse.json(
            { error: 'Failed to save configuration' },
            { status: 500 }
        );
    }
}

// DELETE - Remove TMDb configuration
export async function DELETE() {
    try {
        await fs.unlink(CONFIG_FILE);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        // File doesn't exist, that's fine
        if (error.code === 'ENOENT') {
            return NextResponse.json({ success: true });
        }
        return NextResponse.json({ error: 'Failed to delete config' }, { status: 500 });
    }
}
