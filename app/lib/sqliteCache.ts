import 'server-only';

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { CachedCategory, CachedStream, ContentType, SyncMetadata } from './dbTypes';
import { foldForSearch } from './searchText';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'xstream-player.sqlite');

let sqlite: Database.Database | null = null;

/**
 * How long a cached `get_series_info`/`get_vod_info` payload may be served without
 * asking the provider again. The catalog `last_modified` is the primary freshness
 * signal (see `getDetail`), but plenty of providers never fill it, so a series
 * detail — the payload that carries the episode list — also expires on its own.
 */
const DETAIL_TTL_MS: Record<ContentType, number> = {
    live: 6 * 60 * 60 * 1000,
    movie: 7 * 24 * 60 * 60 * 1000,
    series: 12 * 60 * 60 * 1000,
};

interface StreamRow extends Omit<CachedStream, 'id' | 'backdrop_path'> {
    id: string;
    backdrop_path_json: string | null;
}

interface DetailRow {
    data_json: string;
    source_stamp: string | null;
    timestamp: number;
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

// `category_id` and `id` are only unique *within* a content type: Xtream hands out
// `series_id` from a different sequence than `stream_id`, so a series and a movie
// routinely share the same number. Keying on the bare id let the series step of the
// sync overwrite movies — the composite key is what keeps both rows alive.
const CATEGORIES_TABLE_SQL = (table: string) => `
    CREATE TABLE IF NOT EXISTS ${table} (
        category_id TEXT NOT NULL,
        category_name TEXT NOT NULL,
        parent_id INTEGER,
        type TEXT NOT NULL,
        PRIMARY KEY (category_id, type)
    );
`;

const STREAMS_TABLE_SQL = (table: string) => `
    CREATE TABLE IF NOT EXISTS ${table} (
        id TEXT NOT NULL,
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
        search_name TEXT,
        PRIMARY KEY (id, type)
    );
`;

// `source_stamp` holds the catalog `last_modified` the payload was fetched under,
// which is how a stale episode list is detected after a sync.
const DETAILS_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS details (
        id TEXT NOT NULL,
        type TEXT NOT NULL,
        data_json TEXT NOT NULL,
        source_stamp TEXT,
        timestamp INTEGER NOT NULL,
        PRIMARY KEY (id, type)
    );
`;

const CATALOG_INDEXES_SQL = `
    CREATE INDEX IF NOT EXISTS idx_categories_type
        ON categories (type);
    CREATE INDEX IF NOT EXISTS idx_streams_category_id
        ON streams (category_id);
    CREATE INDEX IF NOT EXISTS idx_streams_type
        ON streams (type);
    CREATE INDEX IF NOT EXISTS idx_streams_type_category
        ON streams (type, category_id);
`;

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
        ${CATEGORIES_TABLE_SQL('categories')}

        ${STREAMS_TABLE_SQL('streams')}

        CREATE TABLE IF NOT EXISTS sync_metadata (
            type TEXT PRIMARY KEY,
            lastSync INTEGER NOT NULL
        );

        ${DETAILS_TABLE_SQL}

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

    migrateSchema(sqlite);

    // Created after the migration: rebuilding a table drops the indexes with it.
    sqlite.exec(CATALOG_INDEXES_SQL);

    return sqlite;
}

interface TableColumn {
    name: string;
    pk: number;
}

function tableColumns(db: Database.Database, table: string): TableColumn[] {
    return db.prepare(`PRAGMA table_info(${table})`).all() as TableColumn[];
}

function isKeyedBy(columns: TableColumn[], expected: string[]) {
    const primaryKey = columns.filter(column => column.pk > 0).map(column => column.name).sort();
    return primaryKey.length === expected.length
        && expected.slice().sort().every((name, index) => primaryKey[index] === name);
}

/**
 * Bring a database created by an older build up to the current schema. CREATE TABLE
 * IF NOT EXISTS leaves an existing table untouched, so every shape change has to be
 * applied by hand here.
 */
function migrateSchema(db: Database.Database) {
    migrateStreamsSchema(db);
    migrateCategoriesSchema(db);
    migrateDetailsSchema(db);
}

/**
 * Two fixes on the streams table:
 *
 * - `search_name` may be missing (added after the first release); the column is
 *   created and the names already stored folded into it, otherwise search returns
 *   nothing until the next full catalog sync. `normalized_name` is dropped in the
 *   same pass — it was never written to, so no data is lost.
 * - the primary key may still be the bare `id`, under which the series step of a
 *   sync silently overwrote every movie sharing its number. The table is rebuilt
 *   on the composite key and the sync marker cleared, so the app re-syncs on the
 *   next load and brings back whatever the collisions had eaten.
 */
function migrateStreamsSchema(db: Database.Database) {
    const columns = tableColumns(db, 'streams');
    const hasColumn = (name: string) => columns.some(column => column.name === name);

    if (!hasColumn('search_name')) {
        db.exec('ALTER TABLE streams ADD COLUMN search_name TEXT');
    }

    if (hasColumn('normalized_name')) {
        db.exec('ALTER TABLE streams DROP COLUMN normalized_name');
    }

    if (!isKeyedBy(columns, ['id', 'type'])) {
        console.warn('[SqliteCache] Rebuilding streams on the (id, type) key; a re-sync will follow');
        db.transaction(() => {
            db.exec(`
                ${STREAMS_TABLE_SQL('streams_migrated')}
                INSERT OR IGNORE INTO streams_migrated (${streamInsertColumns})
                    SELECT ${streamInsertColumns} FROM streams;
                DROP TABLE streams;
                ALTER TABLE streams_migrated RENAME TO streams;
                DELETE FROM sync_metadata;
            `);
        })();
    }

    const pending = db
        .prepare('SELECT id, type, name FROM streams WHERE search_name IS NULL')
        .all() as { id: string; type: ContentType; name: string }[];

    if (pending.length === 0) return;

    const stmt = db.prepare('UPDATE streams SET search_name = ? WHERE id = ? AND type = ?');
    db.transaction(() => {
        for (const row of pending) {
            stmt.run(foldForSearch(row.name || ''), row.id, row.type);
        }
    })();
}

function migrateCategoriesSchema(db: Database.Database) {
    if (isKeyedBy(tableColumns(db, 'categories'), ['category_id', 'type'])) return;

    db.transaction(() => {
        db.exec(`
            ${CATEGORIES_TABLE_SQL('categories_migrated')}
            INSERT OR IGNORE INTO categories_migrated (category_id, category_name, parent_id, type)
                SELECT category_id, category_name, parent_id, type FROM categories;
            DROP TABLE categories;
            ALTER TABLE categories_migrated RENAME TO categories;
            DELETE FROM sync_metadata;
        `);
    })();
}

/**
 * The old details table was keyed by the bare id and never expired, so a series
 * kept serving the episode list captured the first time it was opened — new
 * episodes never showed up — and a movie sharing the id of a series read back the
 * other one's payload. Nothing is copied over: this is a cache, and its old rows
 * are exactly the stale ones.
 */
function migrateDetailsSchema(db: Database.Database) {
    const columns = tableColumns(db, 'details');
    const hasColumn = (name: string) => columns.some(column => column.name === name);

    if (hasColumn('type') && hasColumn('source_stamp')) return;

    console.warn('[SqliteCache] Dropping the legacy detail cache (no content type, no expiry)');
    db.exec(`
        DROP TABLE details;
        ${DETAILS_TABLE_SQL}
    `);
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
        ON CONFLICT(category_id, type) DO UPDATE SET
            category_name = excluded.category_name,
            parent_id = excluded.parent_id
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
        ON CONFLICT(id, type) DO UPDATE SET
            category_id = excluded.category_id,
            name = excluded.name,
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

/**
 * Fill the temporary `sync_keep` table with the ids a sync step just received, so
 * the delete below can be expressed as a single NOT IN over an indexed table
 * instead of a 20k-parameter statement.
 */
function loadKeepIds(db: Database.Database, ids: (string | number)[]) {
    db.exec('CREATE TEMP TABLE IF NOT EXISTS sync_keep (id TEXT PRIMARY KEY)');
    db.prepare('DELETE FROM sync_keep').run();

    const insert = db.prepare('INSERT OR IGNORE INTO sync_keep (id) VALUES (?)');
    for (const id of ids) {
        insert.run(String(id));
    }
}

/**
 * Drop the streams of a type that the provider no longer lists, plus their cached
 * details. An empty list is ignored: it means the sync step brought nothing back,
 * and wiping the whole type on a bad provider response is worse than keeping a
 * stale row around until the next run.
 */
export function pruneStreams(type: ContentType, keepIds: (string | number)[]): number {
    if (keepIds.length === 0) return 0;

    const db = getConnection();

    return db.transaction(() => {
        loadKeepIds(db, keepIds);
        db.prepare('DELETE FROM details WHERE type = ? AND id NOT IN (SELECT id FROM sync_keep)').run(type);
        return db
            .prepare('DELETE FROM streams WHERE type = ? AND id NOT IN (SELECT id FROM sync_keep)')
            .run(type).changes;
    })();
}

export function pruneCategories(type: ContentType, keepIds: (string | number)[]): number {
    if (keepIds.length === 0) return 0;

    const db = getConnection();

    return db.transaction(() => {
        loadKeepIds(db, keepIds);
        return db
            .prepare('DELETE FROM categories WHERE type = ? AND category_id NOT IN (SELECT id FROM sync_keep)')
            .run(type).changes;
    })();
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

export function getStreamsByIds(ids: (string | number)[], type?: ContentType): CachedStream[] {
    if (ids.length === 0) return [];

    // Without a type the same id can match one row per content type, so every match
    // is returned and the caller disambiguates.
    const stmt = getConnection().prepare(`
        SELECT ${streamColumns} FROM streams
        WHERE id = @id AND (@type IS NULL OR type = @type)
    `);
    const streams: CachedStream[] = [];

    for (const id of ids) {
        const rows = stmt.all({ id: String(id), type: type ?? null }) as StreamRow[];
        streams.push(...rows.map(rowToStream));
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

/**
 * The catalog `last_modified` of a title, or `null` when it is not in the catalog
 * yet — which is not the same thing: a missing row means the stamp cannot be
 * compared, an empty one means the provider simply does not publish it.
 */
function catalogStamp(db: Database.Database, type: ContentType, id: string | number): string | null {
    const row = db
        .prepare('SELECT last_modified FROM streams WHERE id = ? AND type = ?')
        .get(String(id), type) as { last_modified: string | null } | undefined;

    return row ? row.last_modified ?? '' : null;
}

export function saveDetail(type: ContentType, id: string | number, data: unknown) {
    const db = getConnection();

    db.prepare(`
        INSERT INTO details (id, type, data_json, source_stamp, timestamp)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id, type) DO UPDATE SET
            data_json = excluded.data_json,
            source_stamp = excluded.source_stamp,
            timestamp = excluded.timestamp
    `).run(String(id), type, JSON.stringify(data), catalogStamp(db, type, id), Date.now());
}

/**
 * Serve a cached provider payload only while it can still be trusted. A series
 * detail carries the episode list, so holding it forever is what kept new episodes
 * from ever appearing: it is dropped as soon as the catalog `last_modified` moves
 * (the provider bumps it when episodes are added) or the type's TTL runs out.
 */
export function getDetail(type: ContentType, id: string | number): unknown | undefined {
    const db = getConnection();
    const row = db
        .prepare('SELECT data_json, source_stamp, timestamp FROM details WHERE id = ? AND type = ?')
        .get(String(id), type) as DetailRow | undefined;

    if (!row) return undefined;

    const stamp = catalogStamp(db, type, id);
    const changedUpstream = stamp !== null && stamp !== (row.source_stamp ?? '');
    const expired = Date.now() - row.timestamp > DETAIL_TTL_MS[type];

    if (changedUpstream || expired) {
        db.prepare('DELETE FROM details WHERE id = ? AND type = ?').run(String(id), type);
        return undefined;
    }

    return parseJson<unknown>(row.data_json, undefined);
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
