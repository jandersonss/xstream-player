import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'xstream_player_db';
const DB_VERSION = 3;

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
