import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const CONFIG_DIR = path.join(process.cwd(), 'data');
const CONFIG_FILE = path.join(CONFIG_DIR, 'opensubtitles-config.json');

interface SubtitleConfig {
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

// GET - Read OpenSubtitles configuration
export async function GET() {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf-8');
        const config: SubtitleConfig = JSON.parse(data);

        return NextResponse.json(config);
    } catch (error: any) {
        // Config file doesn't exist or is invalid
        if (error.code === 'ENOENT') {
            return NextResponse.json({ apiKey: null }, { status: 404 });
        }
        return NextResponse.json({ error: 'Failed to read config' }, { status: 500 });
    }
}

// POST - Save OpenSubtitles configuration
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

        // Validate API key by making a test search request
        // We can use a common movie ID for validation
        const testResponse = await fetch(
            `https://api.opensubtitles.com/api/v1/subtitles?query=The+Matrix&languages=en`,
            {
                headers: {
                    'Api-Key': apiKey,
                    'User-Agent': 'XStreamPlayer v1.0',
                }
            }
        );

        if (!testResponse.ok) {
            return NextResponse.json(
                { error: 'Invalid API key' },
                { status: 400 }
            );
        }

        await ensureConfigDir();

        const config: SubtitleConfig = {
            apiKey,
            updatedAt: new Date().toISOString()
        };

        await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));

        return NextResponse.json({ success: true, config });
    } catch (error) {
        console.error('Error saving OpenSubtitles config:', error);
        return NextResponse.json(
            { error: 'Failed to save configuration' },
            { status: 500 }
        );
    }
}

// DELETE - Remove OpenSubtitles configuration
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
