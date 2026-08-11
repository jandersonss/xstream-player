import type { CachedCategory, CachedStream, ContentType, SavedSubtitle, SyncMetadata } from './dbTypes';

export type { CachedCategory, CachedStream, ContentType, SavedSubtitle, SyncMetadata };

interface CacheResponse<T> {
    data: T | null;
}

async function requestCache<T>(action: string, payload: Record<string, unknown> = {}): Promise<T | undefined> {
    const response = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
    });

    if (!response.ok) {
        throw new Error(`Library action failed: ${action}`);
    }

    const body = await response.json() as CacheResponse<T>;
    return body.data ?? undefined;
}

async function writeCache(action: string, payload: Record<string, unknown> = {}) {
    const response = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
    });

    if (!response.ok) {
        throw new Error(`Library action failed: ${action}`);
    }
}

export const saveDetail = async (type: ContentType, id: string | number, data: unknown) => {
    await writeCache('saveDetail', { type, id, data });
};

export const getDetail = async <T = unknown>(type: ContentType, id: string | number): Promise<T | undefined> => {
    return requestCache<T>('getDetail', { type, id });
};

export const saveCategories = async (categories: CachedCategory[]) => {
    await writeCache('saveCategories', { categories });
};

export const getCategories = async (type?: ContentType): Promise<CachedCategory[]> => {
    return await requestCache<CachedCategory[]>('getCategories', { type }) ?? [];
};

export const saveStreams = async (streams: CachedStream[]) => {
    await writeCache('saveStreams', { streams });
};

export const getStreams = async (categoryId: string, type: ContentType): Promise<CachedStream[]> => {
    return await requestCache<CachedStream[]>('getStreams', { categoryId, type }) ?? [];
};

export const searchStreams = async (query: string, type?: ContentType, limit?: number): Promise<CachedStream[]> => {
    return await requestCache<CachedStream[]>('searchStreams', { query, type, limit }) ?? [];
};

export const getStreamCount = async (type?: ContentType): Promise<number> => {
    return await requestCache<number>('getStreamCount', { type }) ?? 0;
};

export const getStreamsByIds = async (ids: (string | number)[], type?: ContentType): Promise<CachedStream[]> => {
    return await requestCache<CachedStream[]>('getStreamsByIds', { ids, type }) ?? [];
};

export const saveSyncMetadata = async (meta: SyncMetadata) => {
    await writeCache('saveSyncMetadata', { meta });
};

export const getSyncMetadata = async (type: string): Promise<SyncMetadata | undefined> => {
    return requestCache<SyncMetadata>('getSyncMetadata', { type });
};

export const clearCache = async () => {
    await writeCache('clearCache');
};

export const saveTMDbCache = async (key: string, data: unknown) => {
    await writeCache('saveTMDbCache', { key, data });
};

export const getTMDbCache = async <T = unknown>(key: string): Promise<{ data: T; timestamp: number } | undefined> => {
    return requestCache<{ data: T; timestamp: number }>('getTMDbCache', { key });
};

export const clearExpiredTMDbCache = async (ttl: number = 1000 * 60 * 60 * 24) => {
    await writeCache('clearExpiredTMDbCache', { ttl });
};

export const saveCarouselCache = async (dateKey: string, data: unknown[]) => {
    await writeCache('saveCarouselCache', { dateKey, data });
};

export const getCarouselCache = async <T = never>(dateKey: string): Promise<T[] | undefined> => {
    return requestCache<T[]>('getCarouselCache', { dateKey });
};

export const clearExpiredCarouselCache = async (currentDateKey: string) => {
    await writeCache('clearExpiredCarouselCache', { currentDateKey });
};
