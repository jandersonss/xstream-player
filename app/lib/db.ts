import type { CachedCategory, CachedStream, ContentType, SavedSubtitle, SyncMetadata } from './dbTypes';

export type { CachedCategory, CachedStream, ContentType, SavedSubtitle, SyncMetadata };

interface CacheResponse<T> {
    data: T | null;
}

async function requestCache<T>(action: string, payload: Record<string, unknown> = {}): Promise<T | undefined> {
    const response = await fetch('/api/cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
    });

    if (!response.ok) {
        throw new Error(`Cache action failed: ${action}`);
    }

    const body = await response.json() as CacheResponse<T>;
    return body.data ?? undefined;
}

async function writeCache(action: string, payload: Record<string, unknown> = {}) {
    const response = await fetch('/api/cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
    });

    if (!response.ok) {
        throw new Error(`Cache action failed: ${action}`);
    }
}

export const saveDetail = async (id: string | number, data: any) => {
    await writeCache('saveDetail', { id, data });
};

export const getDetail = async (id: string | number): Promise<any | undefined> => {
    return requestCache<any>('getDetail', { id });
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

export const getAllStreams = async (type?: ContentType): Promise<CachedStream[]> => {
    return await requestCache<CachedStream[]>('getAllStreams', { type }) ?? [];
};

export const getStreamCount = async (type?: ContentType): Promise<number> => {
    return await requestCache<number>('getStreamCount', { type }) ?? 0;
};

export const getStreamsByIds = async (ids: (string | number)[]): Promise<CachedStream[]> => {
    return await requestCache<CachedStream[]>('getStreamsByIds', { ids }) ?? [];
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

export const saveTMDbCache = async (key: string, data: any) => {
    await writeCache('saveTMDbCache', { key, data });
};

export const getTMDbCache = async (key: string): Promise<{ data: any; timestamp: number } | undefined> => {
    return requestCache<{ data: any; timestamp: number }>('getTMDbCache', { key });
};

export const clearExpiredTMDbCache = async (ttl: number = 1000 * 60 * 60 * 24) => {
    await writeCache('clearExpiredTMDbCache', { ttl });
};

export const saveCarouselCache = async (dateKey: string, data: any[]) => {
    await writeCache('saveCarouselCache', { dateKey, data });
};

export const getCarouselCache = async (dateKey: string): Promise<any[] | undefined> => {
    return requestCache<any[]>('getCarouselCache', { dateKey });
};

export const clearExpiredCarouselCache = async (currentDateKey: string) => {
    await writeCache('clearExpiredCarouselCache', { currentDateKey });
};
