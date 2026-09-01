import 'server-only';

import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Paired TV devices and the pairing handshake that creates them.
 *
 * Its own database, separate from the other three: a paired device is long-lived
 * credential material (unlike tv-mode.sqlite, which expires in seconds) but it is
 * not user content either — losing it only costs a re-pairing, so it must not ride
 * along in user-data.sqlite, the file that matters in a backup.
 *
 * Devices authenticate with a Bearer token because the TV client runs on a foreign
 * origin (`file://` on webOS), where cookies do not survive.
 */

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'devices.sqlite');

/** A pairing code is only good for five minutes. */
const PAIRING_TTL_MS = 5 * 60 * 1000;
/** Code alphabet without visually ambiguous characters (no 0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
/** How many code candidates to try before giving up (collisions are near-impossible). */
const CODE_ATTEMPTS = 20;

const HASH_ALGORITHM = 'scrypt';
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

/**
 * Verified tokens are cached for a short while. scrypt is deliberately slow (~60ms),
 * and a TV hits the API many times per minute — re-deriving the key on every request
 * would dominate the response time. The cache key is a fast digest of the token, so
 * no plaintext token is held in memory.
 */
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;

let sqlite: Database.Database | null = null;

const tokenCache = new Map<string, { deviceId: string; expiresAt: number }>();

export type DevicePlatform = 'webos' | 'tizen' | 'androidtv' | 'browser' | 'unknown';

const PLATFORMS: DevicePlatform[] = ['webos', 'tizen', 'androidtv', 'browser', 'unknown'];

export interface Device {
    id: string;
    name: string;
    platform: DevicePlatform;
    /** Default profile of the device. Null means "whatever the first profile is". */
    profileId: string | null;
    createdAt: number;
    lastSeenAt: number;
    revokedAt: number | null;
}

export interface PairingRequest {
    code: string;
    pairingId: string;
    expiresAt: number;
}

export type PairingStatus = 'pending' | 'approved' | 'expired';

export interface PairingResult {
    status: PairingStatus;
    /** Plaintext token — only ever present on the single poll that flips to `approved`. */
    token?: string;
    deviceId?: string;
    profileId?: string;
}

interface DeviceRow {
    id: string;
    name: string;
    platform: DevicePlatform;
    token_hash: string;
    profile_id: string | null;
    created_at: number;
    last_seen_at: number;
    revoked_at: number | null;
}

interface PairingRow {
    code: string;
    pairing_id: string;
    device_name: string;
    platform: DevicePlatform;
    expires_at: number;
    approved_device_id: string | null;
    approved_token: string | null;
}

function getConnection(): Database.Database {
    if (sqlite) return sqlite;

    fs.mkdirSync(DATA_DIR, { recursive: true });

    sqlite = new Database(DB_PATH);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('synchronous = NORMAL');
    sqlite.pragma('busy_timeout = 5000');

    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            platform TEXT NOT NULL,
            token_hash TEXT NOT NULL,
            profile_id TEXT,
            created_at INTEGER NOT NULL,
            last_seen_at INTEGER NOT NULL,
            revoked_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS pairing_codes (
            code TEXT PRIMARY KEY,
            pairing_id TEXT NOT NULL UNIQUE,
            device_name TEXT NOT NULL,
            platform TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            approved_device_id TEXT,
            approved_token TEXT
        );
    `);

    return sqlite;
}

// --- Hashing (same format as the remote-access PIN, kept local so this store owns its secrets) ---

function hashSecret(secret: string): string {
    const salt = crypto.randomBytes(16).toString('base64url');
    const key = crypto
        .scryptSync(secret, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
        .toString('base64url');

    return [HASH_ALGORITHM, SCRYPT_N, SCRYPT_R, SCRYPT_P, salt, key].join('$');
}

function verifySecret(secret: string, storedHash: string): boolean {
    const [algorithm, n, r, p, salt, storedKey] = storedHash.split('$');

    if (algorithm !== HASH_ALGORITHM || !n || !r || !p || !salt || !storedKey) {
        return false;
    }

    const nValue = Number(n);
    const rValue = Number(r);
    const pValue = Number(p);

    if (!Number.isFinite(nValue) || !Number.isFinite(rValue) || !Number.isFinite(pValue)) {
        return false;
    }

    try {
        const derivedKey = crypto.scryptSync(secret, salt, KEY_LENGTH, { N: nValue, r: rValue, p: pValue });
        const storedKeyBuffer = Buffer.from(storedKey, 'base64url');

        return storedKeyBuffer.length === derivedKey.length && crypto.timingSafeEqual(storedKeyBuffer, derivedKey);
    } catch {
        return false;
    }
}

// --- Helpers ---

export function isDevicePlatform(value: unknown): value is DevicePlatform {
    return typeof value === 'string' && (PLATFORMS as string[]).includes(value);
}

export function normalizePlatform(value: unknown): DevicePlatform {
    return isDevicePlatform(value) ? value : 'unknown';
}

function generateCode(): string {
    const bytes = crypto.randomBytes(CODE_LENGTH);
    let code = '';

    for (let i = 0; i < CODE_LENGTH; i += 1) {
        code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }

    return code;
}

/**
 * Token shape: `<deviceId>.<32 random bytes, base64url>`. The device id travels in
 * plaintext on purpose — it is not a secret, and it turns verification into a single
 * indexed lookup plus one scrypt, instead of one scrypt per registered device.
 */
function generateToken(deviceId: string): string {
    return `${deviceId}.${crypto.randomBytes(32).toString('base64url')}`;
}

function splitToken(token: string): { deviceId: string; secret: string } | null {
    const separator = token.indexOf('.');
    if (separator <= 0 || separator === token.length - 1) return null;

    return { deviceId: token.slice(0, separator), secret: token.slice(separator + 1) };
}

function cacheKey(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function rowToDevice(row: DeviceRow): Device {
    return {
        id: row.id,
        name: row.name,
        platform: row.platform,
        profileId: row.profile_id,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
        revokedAt: row.revoked_at
    };
}

/** Expired pairing rows are swept on every read — they are pure ephemeral state. */
function prunePairings(db: Database.Database, now: number): void {
    db.prepare('DELETE FROM pairing_codes WHERE expires_at < ?').run(now);
}

// --- Pairing ---

/** Creates a pairing request for a TV waiting on the "type this code" screen. */
export function createPairingCode(deviceName: string, platform: DevicePlatform): PairingRequest {
    const db = getConnection();
    const now = Date.now();
    const expiresAt = now + PAIRING_TTL_MS;
    const pairingId = crypto.randomUUID();

    return db.transaction(() => {
        prunePairings(db, now);

        const insert = db.prepare(
            `INSERT INTO pairing_codes (code, pairing_id, device_name, platform, expires_at)
             VALUES (?, ?, ?, ?, ?)`
        );

        for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
            const code = generateCode();

            try {
                insert.run(code, pairingId, deviceName, platform, expiresAt);
                return { code, pairingId, expiresAt };
            } catch {
                // Code already taken by another live pairing: draw another one.
            }
        }

        throw new Error('Could not allocate a pairing code');
    })();
}

/**
 * Polls a pairing request. On the first poll after approval it hands the plaintext
 * token over and deletes the row in the same transaction, so the token is delivered
 * exactly once and never lingers on disk.
 */
export function consumePairing(pairingId: string): PairingResult {
    const db = getConnection();
    const now = Date.now();

    return db.transaction((): PairingResult => {
        prunePairings(db, now);

        const row = db
            .prepare('SELECT * FROM pairing_codes WHERE pairing_id = ?')
            .get(pairingId) as PairingRow | undefined;

        if (!row) {
            return { status: 'expired' };
        }

        if (!row.approved_device_id || !row.approved_token) {
            return { status: 'pending' };
        }

        const device = db
            .prepare('SELECT * FROM devices WHERE id = ?')
            .get(row.approved_device_id) as DeviceRow | undefined;

        db.prepare('DELETE FROM pairing_codes WHERE pairing_id = ?').run(pairingId);

        if (!device || device.revoked_at !== null) {
            return { status: 'expired' };
        }

        const result: PairingResult = {
            status: 'approved',
            token: row.approved_token,
            deviceId: device.id
        };

        if (device.profile_id) {
            result.profileId = device.profile_id;
        }

        return result;
    })();
}

/**
 * Approves a code typed by the owner on the server UI: creates the device and stashes
 * the plaintext token for the single poll that will pick it up.
 * Returns null when the code is unknown or already expired.
 */
export function approvePairingCode(code: string, name?: string, profileId?: string | null): Device | null {
    const db = getConnection();
    const now = Date.now();
    const normalizedCode = code.trim().toUpperCase();

    return db.transaction((): Device | null => {
        prunePairings(db, now);

        const row = db
            .prepare('SELECT * FROM pairing_codes WHERE code = ?')
            .get(normalizedCode) as PairingRow | undefined;

        if (!row || row.approved_device_id) {
            return null;
        }

        const deviceId = crypto.randomUUID();
        const token = generateToken(deviceId);
        const deviceRow: DeviceRow = {
            id: deviceId,
            name: name?.trim() || row.device_name,
            platform: row.platform,
            token_hash: hashSecret(token),
            profile_id: profileId ?? null,
            created_at: now,
            last_seen_at: now,
            revoked_at: null
        };

        db.prepare(
            `INSERT INTO devices (id, name, platform, token_hash, profile_id, created_at, last_seen_at, revoked_at)
             VALUES (@id, @name, @platform, @token_hash, @profile_id, @created_at, @last_seen_at, @revoked_at)`
        ).run(deviceRow);

        db.prepare(
            'UPDATE pairing_codes SET approved_device_id = ?, approved_token = ? WHERE code = ?'
        ).run(deviceId, token, normalizedCode);

        return rowToDevice(deviceRow);
    })();
}

// --- Devices ---

/** Lists devices for the server UI. The token hash never leaves this module. */
export function listDevices(): Device[] {
    const rows = getConnection()
        .prepare('SELECT * FROM devices WHERE revoked_at IS NULL ORDER BY created_at DESC')
        .all() as DeviceRow[];

    return rows.map(rowToDevice);
}

export function getDevice(id: string): Device | null {
    const row = getConnection().prepare('SELECT * FROM devices WHERE id = ?').get(id) as DeviceRow | undefined;
    return row ? rowToDevice(row) : null;
}

/** Renames a device and/or repoints it at another profile. `null` profile = first profile. */
export function updateDevice(id: string, changes: { name?: string; profileId?: string | null }): Device | null {
    const db = getConnection();
    const row = db.prepare('SELECT * FROM devices WHERE id = ?').get(id) as DeviceRow | undefined;

    if (!row || row.revoked_at !== null) {
        return null;
    }

    const name = changes.name?.trim() || row.name;
    const profileId = changes.profileId === undefined ? row.profile_id : changes.profileId;

    db.prepare('UPDATE devices SET name = ?, profile_id = ? WHERE id = ?').run(name, profileId, id);

    return rowToDevice({ ...row, name, profile_id: profileId });
}

/**
 * Revokes a device. The row is kept (audit trail) but every token derived from it stops
 * working immediately — including the ones sitting in the verification cache.
 */
export function revokeDevice(id: string): boolean {
    const result = getConnection()
        .prepare('UPDATE devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
        .run(Date.now(), id);

    if (result.changes > 0) {
        for (const [key, entry] of tokenCache) {
            if (entry.deviceId === id) tokenCache.delete(key);
        }
    }

    return result.changes > 0;
}

// --- Authentication ---

function pruneTokenCache(now: number): void {
    for (const [key, entry] of tokenCache) {
        if (entry.expiresAt <= now) tokenCache.delete(key);
    }
}

/**
 * Validates a Bearer token and refreshes `last_seen_at`. Returns the device, or null
 * when the token is malformed, unknown or revoked.
 */
export function authenticateToken(token: string): Device | null {
    const parsed = splitToken(token);
    if (!parsed) return null;

    const db = getConnection();
    const now = Date.now();
    const key = cacheKey(token);
    const cached = tokenCache.get(key);

    if (!cached || cached.expiresAt <= now) {
        pruneTokenCache(now);

        const row = db.prepare('SELECT * FROM devices WHERE id = ?').get(parsed.deviceId) as DeviceRow | undefined;

        if (!row || row.revoked_at !== null || !verifySecret(token, row.token_hash)) {
            return null;
        }

        tokenCache.set(key, { deviceId: row.id, expiresAt: now + TOKEN_CACHE_TTL_MS });
        db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(now, row.id);

        return rowToDevice({ ...row, last_seen_at: now });
    }

    const row = db.prepare('SELECT * FROM devices WHERE id = ?').get(cached.deviceId) as DeviceRow | undefined;

    if (!row || row.revoked_at !== null) {
        tokenCache.delete(key);
        return null;
    }

    db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(now, row.id);

    return rowToDevice({ ...row, last_seen_at: now });
}
