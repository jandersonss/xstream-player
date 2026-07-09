import { NextResponse } from 'next/server';
import { enforceRemoteAccessForApi } from '@/app/lib/remoteAccess';
import * as library from '@/app/lib/sqliteCache';
import type { ContentType } from '@/app/lib/dbTypes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LibraryAction =
    | 'saveDetail'
    | 'getDetail'
    | 'saveCategories'
    | 'getCategories'
    | 'saveStreams'
    | 'getStreams'
    | 'getAllStreams'
    | 'getStreamCount'
    | 'getStreamsByIds'
    | 'saveSyncMetadata'
    | 'getSyncMetadata'
    | 'clearCache'
    | 'saveTMDbCache'
    | 'getTMDbCache'
    | 'clearExpiredTMDbCache'
    | 'saveCarouselCache'
    | 'getCarouselCache'
    | 'clearExpiredCarouselCache';

interface LibraryRequestBody {
    action?: LibraryAction;
    id?: string | number;
    ids?: (string | number)[];
    type?: ContentType | string;
    categoryId?: string;
    categories?: Parameters<typeof library.saveCategories>[0];
    streams?: Parameters<typeof library.saveStreams>[0];
    meta?: Parameters<typeof library.saveSyncMetadata>[0];
    key?: string;
    dateKey?: string;
    currentDateKey?: string;
    ttl?: number;
    data?: unknown;
}

function jsonData(data: unknown) {
    return NextResponse.json({ data: data ?? null });
}

export async function POST(request: Request) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    try {
        const body = await request.json() as LibraryRequestBody;

        switch (body.action) {
            case 'saveDetail':
                library.saveDetail(body.id ?? '', body.data);
                return NextResponse.json({ success: true });
            case 'getDetail':
                return jsonData(library.getDetail(body.id ?? ''));
            case 'saveCategories':
                library.saveCategories(body.categories ?? []);
                return NextResponse.json({ success: true });
            case 'getCategories':
                return jsonData(library.getCategories(body.type as ContentType | undefined));
            case 'saveStreams':
                library.saveStreams(body.streams ?? []);
                return NextResponse.json({ success: true });
            case 'getStreams':
                return jsonData(library.getStreams(String(body.categoryId ?? ''), body.type as ContentType));
            case 'getAllStreams':
                return jsonData(library.getAllStreams(body.type as ContentType | undefined));
            case 'getStreamCount':
                return jsonData(library.getStreamCount(body.type as ContentType | undefined));
            case 'getStreamsByIds':
                return jsonData(library.getStreamsByIds(body.ids ?? []));
            case 'saveSyncMetadata':
                if (body.meta) library.saveSyncMetadata(body.meta);
                return NextResponse.json({ success: true });
            case 'getSyncMetadata':
                return jsonData(library.getSyncMetadata(String(body.type ?? '')));
            case 'clearCache':
                library.clearCache();
                return NextResponse.json({ success: true });
            case 'saveTMDbCache':
                library.saveTMDbCache(String(body.key ?? ''), body.data);
                return NextResponse.json({ success: true });
            case 'getTMDbCache':
                return jsonData(library.getTMDbCache(String(body.key ?? '')));
            case 'clearExpiredTMDbCache':
                library.clearExpiredTMDbCache(body.ttl ?? 1000 * 60 * 60 * 24);
                return NextResponse.json({ success: true });
            case 'saveCarouselCache':
                library.saveCarouselCache(String(body.dateKey ?? ''), Array.isArray(body.data) ? body.data : []);
                return NextResponse.json({ success: true });
            case 'getCarouselCache':
                return jsonData(library.getCarouselCache(String(body.dateKey ?? '')));
            case 'clearExpiredCarouselCache':
                library.clearExpiredCarouselCache(String(body.currentDateKey ?? ''));
                return NextResponse.json({ success: true });
            default:
                return NextResponse.json({ error: 'Invalid library action' }, { status: 400 });
        }
    } catch (error) {
        console.error('[Library] Request failed:', error);
        return NextResponse.json({ error: 'Library request failed' }, { status: 500 });
    }
}
