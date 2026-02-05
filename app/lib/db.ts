import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'xstream_player_db';
const DB_VERSION = 5;

export interface CachedCategory {
    category_id: string;
    category_name: string;
    parent_id: number;
    type: 'live' | 'movie' | 'series';
}

export interface CachedStream {
    id: string | number;
    category_id: string;
    name: string;
    type: 'live' | 'movie' | 'series';
    icon?: string;
    rating?: string;
    added?: string;
    data: any; // Raw data from API
}

export interface SyncMetadata {
    type: 'live' | 'movie' | 'series' | 'categories';
    lastSync: number;
}

export const initDB = async (): Promise<IDBPDatabase> => {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion, newVersion, transaction) {
            if (!db.objectStoreNames.contains('categories')) {
                db.createObjectStore('categories', { keyPath: 'category_id' });
            }

            if (!db.objectStoreNames.contains('streams')) {
                const streamStore = db.createObjectStore('streams', { keyPath: 'id' });
                streamStore.createIndex('category_id', 'category_id', { unique: false });
                streamStore.createIndex('type', 'type', { unique: false });
            } else {
                // Store exists, but maybe indexes are missing from a previous version
                const streamStore = transaction.objectStore('streams');
                if (!streamStore.indexNames.contains('category_id')) {
                    streamStore.createIndex('category_id', 'category_id', { unique: false });
                }
                if (!streamStore.indexNames.contains('type')) {
                    streamStore.createIndex('type', 'type', { unique: false });
                }

                // Force clear old data to ensure type consistency for indexes
                if (oldVersion < 3) {
                    streamStore.clear();
                    if (db.objectStoreNames.contains('categories')) {
                        transaction.objectStore('categories').clear();
                    }
                }
            }

            if (!db.objectStoreNames.contains('sync_metadata')) {
                db.createObjectStore('sync_metadata', { keyPath: 'type' });
            }
            if (!db.objectStoreNames.contains('details')) {
                db.createObjectStore('details', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('tmdb_cache')) {
                db.createObjectStore('tmdb_cache', { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains('carousel_cache')) {
                db.createObjectStore('carousel_cache', { keyPath: 'date' });
            }
        },
    });
};

export const saveDetail = async (id: string | number, data: any) => {
    const db = await initDB();
    await db.put('details', { id: String(id), data, timestamp: Date.now() });
};

export const getDetail = async (id: string | number): Promise<any | undefined> => {
    const db = await initDB();
    const entry = await db.get('details', String(id));
    return entry?.data;
};

export const saveCategories = async (categories: CachedCategory[]) => {
    const db = await initDB();
    const tx = db.transaction('categories', 'readwrite');
    const store = tx.objectStore('categories');
    for (const cat of categories) {
        await store.put(cat);
    }
    await tx.done;
};

export const getCategories = async (type?: 'live' | 'movie' | 'series'): Promise<CachedCategory[]> => {
    const db = await initDB();
    const all = await db.getAll('categories');
    if (type) {
        return all.filter(cat => cat.type === type);
    }
    return all;
};

export const saveStreams = async (streams: CachedStream[]) => {
    const db = await initDB();
    const tx = db.transaction('streams', 'readwrite');
    const store = tx.objectStore('streams');
    for (const stream of streams) {
        await store.put(stream);
    }
    await tx.done;
};

export const getStreams = async (categoryId: string, type: 'live' | 'movie' | 'series'): Promise<CachedStream[]> => {
    const db = await initDB();
    const all = await db.getAllFromIndex('streams', 'category_id', String(categoryId));
    return all.filter(s => s.type === type);
};

export const getAllStreams = async (type?: 'live' | 'movie' | 'series'): Promise<CachedStream[]> => {
    const db = await initDB();
    if (type) {
        return db.getAllFromIndex('streams', 'type', type);
    }
    return db.getAll('streams');
};

export const saveSyncMetadata = async (meta: SyncMetadata) => {
    const db = await initDB();
    await db.put('sync_metadata', meta);
};

export const getSyncMetadata = async (type: string): Promise<SyncMetadata | undefined> => {
    const db = await initDB();
    return db.get('sync_metadata', type);
};

export const clearCache = async () => {
    const db = await initDB();
    await db.clear('categories');
    await db.clear('streams');
    await db.clear('sync_metadata');
    await db.clear('details');
};

// TMDb Cache functions
export const saveTMDbCache = async (key: string, data: any) => {
    const db = await initDB();
    await db.put('tmdb_cache', { key, data, timestamp: Date.now() });
};

export const getTMDbCache = async (key: string): Promise<{ data: any; timestamp: number } | undefined> => {
    const db = await initDB();
    return db.get('tmdb_cache', key);
};

export const clearExpiredTMDbCache = async (ttl: number = 1000 * 60 * 60 * 24) => {
    const db = await initDB();
    const all = await db.getAll('tmdb_cache');
    const now = Date.now();
    const tx = db.transaction('tmdb_cache', 'readwrite');
    const store = tx.objectStore('tmdb_cache');

    for (const item of all) {
        if (now - item.timestamp > ttl) {
            await store.delete(item.key);
        }
    }
    await tx.done;
};

// Carousel Cache functions (Daily)
export const saveCarouselCache = async (dateKey: string, data: any[]) => {
    const db = await initDB();
    await db.put('carousel_cache', { date: dateKey, data, timestamp: Date.now() });
};

export const getCarouselCache = async (dateKey: string): Promise<any[] | undefined> => {
    const db = await initDB();
    const entry = await db.get('carousel_cache', dateKey);
    return entry?.data;
};

export const clearExpiredCarouselCache = async (currentDateKey: string) => {
    const db = await initDB();
    const allKeys = await db.getAllKeys('carousel_cache');
    const tx = db.transaction('carousel_cache', 'readwrite');
    const store = tx.objectStore('carousel_cache');

    for (const key of allKeys) {
        if (key !== currentDateKey) {
            await store.delete(key);
        }
    }
    await tx.done;
};
