import 'server-only';

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { CachedCategory, CachedStream, ContentType, SyncMetadata } from './dbTypes';
import { foldForSearch } from './searchText';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'xstream-player.sqlite');

let sqlite: Database.Database | null = null;

interface StreamRow extends Omit<CachedStream, 'id' | 'backdrop_path'> {
    id: string;
    backdrop_path_json: string | null;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) return fallback;

    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

function rowToStream(row: StreamRow): CachedStream {
    const { backdrop_path_json, ...stream } = row;
    return {
        ...stream,
        backdrop_path: parseJson<string[] | undefined>(backdrop_path_json, undefined),
    };
}

function toNullable(value: unknown) {
    return value === undefined ? null : value;
}

function toStreamParams(stream: CachedStream) {
    return {
        id: String(stream.id),
        category_id: String(stream.category_id),
        name: stream.name || '',
        type: stream.type,
        icon: toNullable(stream.icon),
        rating: toNullable(stream.rating),
        added: toNullable(stream.added),
        container_extension: toNullable(stream.container_extension),
        epg_channel_id: toNullable(stream.epg_channel_id),
        stream_type: toNullable(stream.stream_type),
        cover: toNullable(stream.cover),
        plot: toNullable(stream.plot),
        cast: toNullable(stream.cast),
        director: toNullable(stream.director),
        genre: toNullable(stream.genre),
        release_date: toNullable(stream.release_date),
        rating_5based: toNullable(stream.rating_5based),
        backdrop_path_json: stream.backdrop_path ? JSON.stringify(stream.backdrop_path) : null,
        last_modified: toNullable(stream.last_modified),
        search_name: foldForSearch(stream.name || ''),
    };
}

function getConnection() {
    if (sqlite) return sqlite;

    fs.mkdirSync(DATA_DIR, { recursive: true });

    sqlite = new Database(DB_PATH);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('synchronous = NORMAL');
    sqlite.pragma('temp_store = MEMORY');
    sqlite.pragma('busy_timeout = 5000');
    sqlite.pragma('foreign_keys = ON');

    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS categories (
            category_id TEXT PRIMARY KEY,
            category_name TEXT NOT NULL,
            parent_id INTEGER,
            type TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_categories_type
            ON categories (type);

        CREATE TABLE IF NOT EXISTS streams (
            id TEXT PRIMARY KEY,
            category_id TEXT NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            icon TEXT,
            rating TEXT,
            added TEXT,
            container_extension TEXT,
            epg_channel_id TEXT,
            stream_type TEXT,
            cover TEXT,
            plot TEXT,
            "cast" TEXT,
            director TEXT,
            genre TEXT,
            release_date TEXT,
            rating_5based TEXT,
            backdrop_path_json TEXT,
            last_modified TEXT,
            search_name TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_streams_category_id
            ON streams (category_id);
        CREATE INDEX IF NOT EXISTS idx_streams_type
            ON streams (type);
        CREATE INDEX IF NOT EXISTS idx_streams_type_category
            ON streams (type, category_id);

        CREATE TABLE IF NOT EXISTS sync_metadata (
            type TEXT PRIMARY KEY,
            lastSync INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS details (
            id TEXT PRIMARY KEY,
            data_json TEXT NOT NULL,
            timestamp INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tmdb_cache (
            key TEXT PRIMARY KEY,
            data_json TEXT NOT NULL,
            timestamp INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS carousel_cache (
            date TEXT PRIMARY KEY,
            data_json TEXT NOT NULL,
            timestamp INTEGER NOT NULL
        );
    `);

    migrateStreamsSchema(sqlite);

    return sqlite;
}

/**
 * Reconcile a database created before `search_name` existed: CREATE TABLE IF NOT
 * EXISTS leaves an existing table untouched, so the column has to be added and
 * the names already stored folded into it — otherwise search returns nothing
 * until the next full catalog sync.
 *
 * `normalized_name` is dropped in the same pass: it was never written to, so no
 * data is lost.
 */
function migrateStreamsSchema(db: Database.Database) {
    const columns = db.prepare('PRAGMA table_info(streams)').all() as { name: string }[];
    const hasColumn = (name: string) => columns.some(column => column.name === name);

    if (!hasColumn('search_name')) {
        db.exec('ALTER TABLE streams ADD COLUMN search_name TEXT');
    }

    if (hasColumn('normalized_name')) {
        db.exec('ALTER TABLE streams DROP COLUMN normalized_name');
    }

    const pending = db
        .prepare('SELECT id, name FROM streams WHERE search_name IS NULL')
        .all() as { id: string; name: string }[];

    if (pending.length === 0) return;

    const stmt = db.prepare('UPDATE streams SET search_name = ? WHERE id = ?');
    db.transaction(() => {
        for (const row of pending) {
            stmt.run(foldForSearch(row.name || ''), row.id);
        }
    })();
}

const streamColumns = `
    id, category_id, name, type, icon, rating, added,
    container_extension, epg_channel_id, stream_type, cover, plot, "cast",
    director, genre, release_date, rating_5based, backdrop_path_json,
    last_modified
`;

// `search_name` is an internal matching column, never projected back to callers.
const streamInsertColumns = `${streamColumns}, search_name`;

export function saveCategories(categories: CachedCategory[]) {
    if (categories.length === 0) return;

    const db = getConnection();
    const stmt = db.prepare(`
        INSERT INTO categories (category_id, category_name, parent_id, type)
        VALUES (@category_id, @category_name, @parent_id, @type)
        ON CONFLICT(category_id) DO UPDATE SET
            category_name = excluded.category_name,
            parent_id = excluded.parent_id,
            type = excluded.type
    `);

    const write = db.transaction((items: CachedCategory[]) => {
        for (const category of items) {
            stmt.run({
                category_id: String(category.category_id),
                category_name: category.category_name || '',
                parent_id: category.parent_id ?? null,
                type: category.type,
            });
        }
    });

    write(categories);
}

export function getCategories(type?: ContentType): CachedCategory[] {
    const db = getConnection();

    if (type) {
        return db.prepare('SELECT category_id, category_name, parent_id, type FROM categories WHERE type = ? ORDER BY category_name COLLATE NOCASE').all(type) as CachedCategory[];
    }

    return db.prepare('SELECT category_id, category_name, parent_id, type FROM categories ORDER BY type, category_name COLLATE NOCASE').all() as CachedCategory[];
}

export function saveStreams(streams: CachedStream[]) {
    if (streams.length === 0) return;

    const db = getConnection();
    const stmt = db.prepare(`
        INSERT INTO streams (${streamInsertColumns})
        VALUES (
            @id, @category_id, @name, @type, @icon, @rating, @added,
            @container_extension, @epg_channel_id,
            @stream_type, @cover, @plot, @cast, @director, @genre,
            @release_date, @rating_5based, @backdrop_path_json,
            @last_modified, @search_name
        )
        ON CONFLICT(id) DO UPDATE SET
            category_id = excluded.category_id,
            name = excluded.name,
            type = excluded.type,
            icon = excluded.icon,
            rating = excluded.rating,
            added = excluded.added,
            container_extension = excluded.container_extension,
            epg_channel_id = excluded.epg_channel_id,
            stream_type = excluded.stream_type,
            cover = excluded.cover,
            plot = excluded.plot,
            "cast" = excluded."cast",
            director = excluded.director,
            genre = excluded.genre,
            release_date = excluded.release_date,
            rating_5based = excluded.rating_5based,
            backdrop_path_json = excluded.backdrop_path_json,
            last_modified = excluded.last_modified,
            search_name = excluded.search_name
    `);

    const write = db.transaction((items: CachedStream[]) => {
        for (const stream of items) {
            stmt.run(toStreamParams(stream));
        }
    });

    write(streams);
}

export function getStreams(categoryId: string, type: ContentType): CachedStream[] {
    const rows = getConnection()
        .prepare(`SELECT ${streamColumns} FROM streams WHERE type = ? AND category_id = ? ORDER BY name COLLATE NOCASE`)
        .all(type, String(categoryId)) as StreamRow[];

    return rows.map(rowToStream);
}

export function getAllStreams(type?: ContentType): CachedStream[] {
    const db = getConnection();
    const rows = type
        ? db.prepare(`SELECT ${streamColumns} FROM streams WHERE type = ? ORDER BY name COLLATE NOCASE`).all(type) as StreamRow[]
        : db.prepare(`SELECT ${streamColumns} FROM streams ORDER BY type, name COLLATE NOCASE`).all() as StreamRow[];

    return rows.map(rowToStream);
}

/**
 * Search the catalog by folded name, best matches first.
 *
 * The ranking puts an exact title above a title that starts with the query,
 * above one where the query starts a word, above a bare substring — so "pânico"
 * outranks "Pânico na Floresta", which outranks "Entrando em Pânico". Ties break
 * on the shorter title, which keeps the plain film ahead of its sequels.
 *
 * A leading-wildcard LIKE cannot use an index, so this is a full scan either
 * way; scanning the precomputed column in SQLite still beats shipping the whole
 * catalog to the client and folding 20k names in JS on every keystroke.
 */
export function searchStreams(query: string, type?: ContentType, limit = 300): CachedStream[] {
    const folded = foldForSearch(query);
    if (!folded) return [];

    const rows = getConnection()
        .prepare(`
            SELECT ${streamColumns}
            FROM streams
            WHERE search_name LIKE @contains
              AND (@type IS NULL OR type = @type)
            ORDER BY
                CASE
                    WHEN search_name = @exact THEN 0
                    WHEN search_name LIKE @prefix THEN 1
                    WHEN search_name LIKE @word THEN 2
                    ELSE 3
                END,
                LENGTH(name),
                name COLLATE NOCASE
            LIMIT @limit
        `)
        .all({
            exact: folded,
            prefix: `${folded}%`,
            word: `% ${folded}%`,
            contains: `%${folded}%`,
            type: type ?? null,
            limit,
        }) as StreamRow[];

    return rows.map(rowToStream);
}

export function getStreamCount(type?: ContentType): number {
    const row = type
        ? getConnection().prepare('SELECT COUNT(*) AS total FROM streams WHERE type = ?').get(type) as { total: number }
        : getConnection().prepare('SELECT COUNT(*) AS total FROM streams').get() as { total: number };

    return row.total;
}

export function getStreamsByIds(ids: (string | number)[]): CachedStream[] {
    if (ids.length === 0) return [];

    const stmt = getConnection().prepare(`SELECT ${streamColumns} FROM streams WHERE id = ?`);
    const streams: CachedStream[] = [];

    for (const id of ids) {
        const row = stmt.get(String(id)) as StreamRow | undefined;
        if (row) streams.push(rowToStream(row));
    }

    return streams;
}

export function saveSyncMetadata(meta: SyncMetadata) {
    getConnection()
        .prepare(`
            INSERT INTO sync_metadata (type, lastSync)
            VALUES (@type, @lastSync)
            ON CONFLICT(type) DO UPDATE SET lastSync = excluded.lastSync
        `)
        .run(meta);
}

export function getSyncMetadata(type: string): SyncMetadata | undefined {
    return getConnection()
        .prepare('SELECT type, lastSync FROM sync_metadata WHERE type = ?')
        .get(type) as SyncMetadata | undefined;
}

export function saveDetail(id: string | number, data: unknown) {
    getConnection()
        .prepare(`
            INSERT INTO details (id, data_json, timestamp)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                data_json = excluded.data_json,
                timestamp = excluded.timestamp
        `)
        .run(String(id), JSON.stringify(data), Date.now());
}

export function getDetail(id: string | number): unknown | undefined {
    const row = getConnection()
        .prepare('SELECT data_json FROM details WHERE id = ?')
        .get(String(id)) as { data_json: string } | undefined;

    return row ? parseJson<unknown>(row.data_json, undefined) : undefined;
}

export function clearCache() {
    const db = getConnection();
    db.transaction(() => {
        db.prepare('DELETE FROM categories').run();
        db.prepare('DELETE FROM streams').run();
        db.prepare('DELETE FROM sync_metadata').run();
        db.prepare('DELETE FROM details').run();
    })();
}

export function saveTMDbCache(key: string, data: unknown) {
    getConnection()
        .prepare(`
            INSERT INTO tmdb_cache (key, data_json, timestamp)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                data_json = excluded.data_json,
                timestamp = excluded.timestamp
        `)
        .run(key, JSON.stringify(data), Date.now());
}

export function getTMDbCache(key: string): { data: unknown; timestamp: number } | undefined {
    const row = getConnection()
        .prepare('SELECT data_json, timestamp FROM tmdb_cache WHERE key = ?')
        .get(key) as { data_json: string; timestamp: number } | undefined;

    return row ? { data: parseJson(row.data_json, null), timestamp: row.timestamp } : undefined;
}

export function clearExpiredTMDbCache(ttl: number) {
    getConnection()
        .prepare('DELETE FROM tmdb_cache WHERE timestamp < ?')
        .run(Date.now() - ttl);
}

export function saveCarouselCache(dateKey: string, data: unknown[]) {
    getConnection()
        .prepare(`
            INSERT INTO carousel_cache (date, data_json, timestamp)
            VALUES (?, ?, ?)
            ON CONFLICT(date) DO UPDATE SET
                data_json = excluded.data_json,
                timestamp = excluded.timestamp
        `)
        .run(dateKey, JSON.stringify(data), Date.now());
}

export function getCarouselCache(dateKey: string): unknown[] | undefined {
    const row = getConnection()
        .prepare('SELECT data_json FROM carousel_cache WHERE date = ?')
        .get(dateKey) as { data_json: string } | undefined;

    return row ? parseJson<unknown[] | undefined>(row.data_json, undefined) : undefined;
}

// `keepPattern` is a SQL LIKE pattern matching every key that is still current.
// The carousel and hero entries share this table under different keys, so an
// exact-match eviction would drop the hero cache on every carousel request.
export function clearExpiredCarouselCache(keepPattern: string) {
    getConnection()
        .prepare('DELETE FROM carousel_cache WHERE date NOT LIKE ?')
        .run(keepPattern);
}
