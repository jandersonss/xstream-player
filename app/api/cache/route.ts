import { NextResponse } from 'next/server';
import { enforceRemoteAccessForApi } from '@/app/lib/remoteAccess';
import * as cache from '@/app/lib/sqliteCache';
import type { ContentType } from '@/app/lib/dbTypes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CacheAction =
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

interface CacheRequestBody {
    action?: CacheAction;
    id?: string | number;
    ids?: (string | number)[];
    type?: ContentType | string;
    categoryId?: string;
    categories?: Parameters<typeof cache.saveCategories>[0];
    streams?: Parameters<typeof cache.saveStreams>[0];
    meta?: Parameters<typeof cache.saveSyncMetadata>[0];
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
        const body = await request.json() as CacheRequestBody;

        switch (body.action) {
            case 'saveDetail':
                cache.saveDetail(body.id ?? '', body.data);
                return NextResponse.json({ success: true });
            case 'getDetail':
                return jsonData(cache.getDetail(body.id ?? ''));
            case 'saveCategories':
                cache.saveCategories(body.categories ?? []);
                return NextResponse.json({ success: true });
            case 'getCategories':
                return jsonData(cache.getCategories(body.type as ContentType | undefined));
            case 'saveStreams':
                cache.saveStreams(body.streams ?? []);
                return NextResponse.json({ success: true });
            case 'getStreams':
                return jsonData(cache.getStreams(String(body.categoryId ?? ''), body.type as ContentType));
            case 'getAllStreams':
                return jsonData(cache.getAllStreams(body.type as ContentType | undefined));
            case 'getStreamCount':
                return jsonData(cache.getStreamCount(body.type as ContentType | undefined));
            case 'getStreamsByIds':
                return jsonData(cache.getStreamsByIds(body.ids ?? []));
            case 'saveSyncMetadata':
                if (body.meta) cache.saveSyncMetadata(body.meta);
                return NextResponse.json({ success: true });
            case 'getSyncMetadata':
                return jsonData(cache.getSyncMetadata(String(body.type ?? '')));
            case 'clearCache':
                cache.clearCache();
                return NextResponse.json({ success: true });
            case 'saveTMDbCache':
                cache.saveTMDbCache(String(body.key ?? ''), body.data);
                return NextResponse.json({ success: true });
            case 'getTMDbCache':
                return jsonData(cache.getTMDbCache(String(body.key ?? '')));
            case 'clearExpiredTMDbCache':
                cache.clearExpiredTMDbCache(body.ttl ?? 1000 * 60 * 60 * 24);
                return NextResponse.json({ success: true });
            case 'saveCarouselCache':
                cache.saveCarouselCache(String(body.dateKey ?? ''), Array.isArray(body.data) ? body.data : []);
                return NextResponse.json({ success: true });
            case 'getCarouselCache':
                return jsonData(cache.getCarouselCache(String(body.dateKey ?? '')));
            case 'clearExpiredCarouselCache':
                cache.clearExpiredCarouselCache(String(body.currentDateKey ?? ''));
                return NextResponse.json({ success: true });
            default:
                return NextResponse.json({ error: 'Invalid cache action' }, { status: 400 });
        }
    } catch (error) {
        console.error('[Cache] Request failed:', error);
        return NextResponse.json({ error: 'Cache request failed' }, { status: 500 });
    }
}
