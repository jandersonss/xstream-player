import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const SUMMARY_PATH = path.join(DATA_DIR, 'watch-progress.json');

export async function GET(
    request: Request,
    { params }: { params: Promise<{ type: string; id: string }> }
) {
    try {
        const { type, id } = await params;
        const fileName = `${type}-${id}.json`;
        const filePath = path.join(DATA_DIR, fileName);

        const data = await fs.readFile(filePath, 'utf-8');
        return NextResponse.json(JSON.parse(data));
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            return NextResponse.json({});
        }
        return NextResponse.json({ error: 'Failed to read granular progress' }, { status: 500 });
    }
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ type: string; id: string }> }
) {
    try {
        const { type, id } = await params;
        const progress = await request.json();
        const fileName = `${type}-${id}.json`;
        const filePath = path.join(DATA_DIR, fileName);

        // 1. Save to granular file
        let granularData: any = {};
        if (type === 'series') {
            try {
                const content = await fs.readFile(filePath, 'utf-8');
                granularData = JSON.parse(content);
            } catch (e) { }
            granularData[String(progress.episodeId || progress.streamId)] = progress;
        } else {
            granularData = progress;
        }
        await fs.writeFile(filePath, JSON.stringify(granularData, null, 2));

        // 2. Update summary file
        let summary: any = {};
        try {
            const content = await fs.readFile(SUMMARY_PATH, 'utf-8');
            summary = JSON.parse(content);
        } catch (e) { }

        const summaryKey = type === 'series' ? String(id) : String(progress.streamId);
        summary[summaryKey] = progress;
        await fs.writeFile(SUMMARY_PATH, JSON.stringify(summary, null, 2));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Save granular progress error:', error);
        return NextResponse.json({ error: 'Failed to save granular progress' }, { status: 500 });
    }
}
