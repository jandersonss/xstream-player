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
        const body = await request.json(); // Map of streamId -> WatchProgress
        const dataDir = path.join(process.cwd(), 'data');

        // Ensure data directory exists
        await fs.mkdir(dataDir, { recursive: true });

        // Body is the full map from Context
        // We want to save individual files for each content when they are updated
        // For simplicity, we compare and save.

        // Read existing summary to find what changed
        let existingMap: any = {};
        try {
            const data = await fs.readFile(PROGRESS_PATH, 'utf-8');
            existingMap = JSON.parse(data);
        } catch (e) { }

        // Save detailed files for episodes/movies that were updated
        for (const [id, progress] of Object.entries(body) as [string, any][]) {
            const existing = existingMap[id];

            // If it's new or timestamp is different/newer
            if (!existing || progress.timestamp > (existing.timestamp || 0)) {
                if (progress.type === 'series' && progress.seriesId) {
                    const seriesFilePath = path.join(dataDir, `series-${progress.seriesId}.json`);
                    let seriesData: any = {};
                    try {
                        const content = await fs.readFile(seriesFilePath, 'utf-8');
                        seriesData = JSON.parse(content);
                    } catch (e) { }

                    seriesData[progress.streamId] = progress;
                    await fs.writeFile(seriesFilePath, JSON.stringify(seriesData, null, 2));
                } else if (progress.type === 'movie') {
                    const movieFilePath = path.join(dataDir, `movie-${progress.streamId}.json`);
                    await fs.writeFile(movieFilePath, JSON.stringify(progress, null, 2));
                }
            }
        }

        // Save the summary map
        await fs.writeFile(PROGRESS_PATH, JSON.stringify(body, null, 2));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Save progress error:', error);
        return NextResponse.json({ error: 'Failed to save watch progress' }, { status: 500 });
    }
}
