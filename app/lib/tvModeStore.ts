import 'server-only';

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

/**
 * TV Mode runtime state: which devices are broadcasting, and the playback sync
 * between the players sharing a broadcast.
 *
 * Its own database, separate from the other two: this state is disposable (every
 * row expires within seconds if the heartbeats stop) and write-hot, so it must not
 * live in user-data.sqlite (the irreplaceable backup target) nor in
 * xstream-player.sqlite (which users are told to delete to force a catalog re-sync).
 * Deleting this file only costs a heartbeat: the devices re-announce themselves.
 *
 * It is on disk instead of in memory because the app may run in more than one
 * instance with the `data` folder shared — only the file is visible to all processes.
 *
 * The playback sync metric is "live latency": the distance, in seconds, between the
 * current position and the live edge (`seekable.end`). Everyone consumes the SAME
 * sliding HLS window (served by the relay/ffmpeg), so the live edge is the same media
 * instant for all — "8s behind the edge" is the same frame on any player. Syncing A to
 * B = matching the latency (by adjusting currentTime).
 */

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'tv-mode.sqlite');

/** A session is considered dead if it has not received a heartbeat for longer than this. */
export const SESSION_TTL_MS = 45 * 1000;
/** Suggested heartbeat interval for the client (shorter than the TTL). */
export const HEARTBEAT_MS = 20 * 1000;
/** A participant without a heartbeat for longer than this is discarded. */
const PARTICIPANT_TTL_MS = 15 * 1000;
/** A "sync" command older than this is ignored (avoids endless re-seeking). */
const COMMAND_TTL_MS = 30 * 1000;

let sqlite: Database.Database | null = null;

export type ShareContentType = 'live' | 'movie' | 'series';

export interface ShareSession {
    /** Stable device identity (also the session key). */
    deviceId: string;
    deviceName: string;
    contentType: ShareContentType;
    /** Xtream stream_id (channel, movie or episode). */
    streamId: string;
    title: string;
    poster?: string;
    /** VOD file extension (mp4/mkv…), to start the VOD relay. */
    ext?: string;
    /** For series: the series id (streamId is the episode id). */
    seriesId?: string;
    /** Device LAN IP (best-effort), via WebRTC on the client or a header on the server. */
    ip?: string;
    updatedAt: number;
}

export type SyncRole = 'broadcaster' | 'viewer';

export interface SyncParticipant {
    deviceId: string;
    role: SyncRole;
    latency: number;
}

export interface SyncState {
    participants: SyncParticipant[];
    command?: { epoch: number; targetLatency: number };
}

interface SessionRow {
    device_id: string;
    device_name: string;
    content_type: ShareContentType;
    stream_id: string;
    title: string;
    poster: string | null;
    ext: string | null;
    series_id: string | null;
    ip: string | null;
    updated_at: number;
}

interface ParticipantRow {
    device_id: string;
    role: SyncRole;
    latency: number;
}

interface CommandRow {
    epoch: number;
    target_latency: number;
}

function getConnection(): Database.Database {
    if (sqlite) return sqlite;

    fs.mkdirSync(DATA_DIR, { recursive: true });

    sqlite = new Database(DB_PATH);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('synchronous = NORMAL');
    sqlite.pragma('busy_timeout = 5000');

    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS share_sessions (
            device_id TEXT PRIMARY KEY,
            device_name TEXT NOT NULL,
            content_type TEXT NOT NULL,
            stream_id TEXT NOT NULL,
            title TEXT NOT NULL,
            poster TEXT,
            ext TEXT,
            series_id TEXT,
            ip TEXT,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sync_participants (
            stream_key TEXT NOT NULL,
            device_id TEXT NOT NULL,
            role TEXT NOT NULL,
            latency REAL NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (stream_key, device_id)
        );

        CREATE TABLE IF NOT EXISTS sync_commands (
            stream_key TEXT PRIMARY KEY,
            epoch INTEGER NOT NULL,
            target_latency REAL NOT NULL
        );
    `);

    dropLegacyJson();

    return sqlite;
}

/** The JSON files this store replaced. Nothing to migrate: every row expires in seconds. */
function dropLegacyJson(): void {
    for (const file of ['live-sessions.json', 'live-sync.json']) {
        try {
            fs.unlinkSync(path.join(DATA_DIR, file));
        } catch {
            // Never existed, or already removed.
        }
    }
}

function rowToSession(row: SessionRow): ShareSession {
    const session: ShareSession = {
        deviceId: row.device_id,
        deviceName: row.device_name,
        contentType: row.content_type,
        streamId: row.stream_id,
        title: row.title,
        updatedAt: row.updated_at
    };

    if (row.poster !== null) session.poster = row.poster;
    if (row.ext !== null) session.ext = row.ext;
    if (row.series_id !== null) session.seriesId = row.series_id;
    if (row.ip !== null) session.ip = row.ip;

    return session;
}

// --- Broadcast sessions ---

/** Lists the active broadcasts, discarding the expired ones. */
export function listActiveSessions(): ShareSession[] {
    const db = getConnection();
    db.prepare('DELETE FROM share_sessions WHERE updated_at < ?').run(Date.now() - SESSION_TTL_MS);

    const rows = db
        .prepare('SELECT * FROM share_sessions ORDER BY updated_at DESC')
        .all() as SessionRow[];

    return rows.map(rowToSession);
}

/** Creates or updates (heartbeat) the device broadcast. A device broadcasts one content at a time. */
export function upsertSession(input: Omit<ShareSession, 'updatedAt'>): ShareSession {
    const session: ShareSession = { ...input, updatedAt: Date.now() };

    getConnection()
        .prepare(
            `INSERT INTO share_sessions
                (device_id, device_name, content_type, stream_id, title, poster, ext, series_id, ip, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(device_id) DO UPDATE SET
                device_name = excluded.device_name,
                content_type = excluded.content_type,
                stream_id = excluded.stream_id,
                title = excluded.title,
                poster = excluded.poster,
                ext = excluded.ext,
                series_id = excluded.series_id,
                ip = excluded.ip,
                updated_at = excluded.updated_at`
        )
        .run(
            session.deviceId,
            session.deviceName,
            session.contentType,
            session.streamId,
            session.title,
            session.poster ?? null,
            session.ext ?? null,
            session.seriesId ?? null,
            session.ip ?? null,
            session.updatedAt
        );

    return session;
}

/** Ends a device broadcast. */
export function endSession(deviceId: string): void {
    getConnection().prepare('DELETE FROM share_sessions WHERE device_id = ?').run(deviceId);
}

// --- Playback sync ---

/** Removes expired participants and commands. */
function pruneSync(db: Database.Database, now: number): void {
    db.prepare('DELETE FROM sync_participants WHERE updated_at < ?').run(now - PARTICIPANT_TTL_MS);
    db.prepare('DELETE FROM sync_commands WHERE epoch < ?').run(now - COMMAND_TTL_MS);
}

function snapshot(db: Database.Database, streamKey: string): SyncState {
    const participants = db
        .prepare('SELECT device_id, role, latency FROM sync_participants WHERE stream_key = ?')
        .all(streamKey) as ParticipantRow[];

    const command = db
        .prepare('SELECT epoch, target_latency FROM sync_commands WHERE stream_key = ?')
        .get(streamKey) as CommandRow | undefined;

    const state: SyncState = {
        participants: participants.map((p) => ({
            deviceId: p.device_id,
            role: p.role,
            latency: p.latency
        }))
    };

    if (command) {
        state.command = { epoch: command.epoch, targetLatency: command.target_latency };
    }

    return state;
}

/** Records/updates a participant's latency and returns the broadcast's current state. */
export function reportParticipant(
    streamKey: string,
    deviceId: string,
    role: SyncRole,
    latency: number
): SyncState {
    const db = getConnection();
    const now = Date.now();

    return db.transaction(() => {
        pruneSync(db, now);
        db.prepare(
            `INSERT INTO sync_participants (stream_key, device_id, role, latency, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(stream_key, device_id) DO UPDATE SET
                role = excluded.role,
                latency = excluded.latency,
                updated_at = excluded.updated_at`
        ).run(streamKey, deviceId, role, latency, now);

        return snapshot(db, streamKey);
    })();
}

/** The broadcaster asks out-of-sync viewers to jump to the target latency. */
export function setSyncCommand(streamKey: string, targetLatency: number): SyncState {
    const db = getConnection();
    const now = Date.now();

    return db.transaction(() => {
        pruneSync(db, now);
        db.prepare(
            `INSERT INTO sync_commands (stream_key, epoch, target_latency)
             VALUES (?, ?, ?)
             ON CONFLICT(stream_key) DO UPDATE SET
                epoch = excluded.epoch,
                target_latency = excluded.target_latency`
        ).run(streamKey, now, targetLatency);

        return snapshot(db, streamKey);
    })();
}

/** Reads the current state, discarding expired participants/commands. */
export function getSyncState(streamKey: string): SyncState {
    const db = getConnection();
    const now = Date.now();

    return db.transaction(() => {
        pruneSync(db, now);
        return snapshot(db, streamKey);
    })();
}
