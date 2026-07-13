import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const SESSIONS_PATH = path.join(DATA_DIR, 'live-sessions.json');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

/** A session is considered dead if it has not received a heartbeat for longer than this. */
export const SESSION_TTL_MS = 45 * 1000;
/** Suggested heartbeat interval for the client (shorter than the TTL). */
export const HEARTBEAT_MS = 20 * 1000;

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

interface StoredCredentials {
    hostUrl: string;
    username: string;
    password: string;
}

async function readSessions(): Promise<ShareSession[]> {
    try {
        const raw = await fs.readFile(SESSIONS_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

async function writeSessions(sessions: ShareSession[]): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(SESSIONS_PATH, JSON.stringify(sessions, null, 2));
}

function isFresh(session: ShareSession, now: number): boolean {
    return now - session.updatedAt <= SESSION_TTL_MS;
}

/** Lists the active broadcasts, discarding (and persisting) the expired ones. */
export async function listActiveSessions(): Promise<ShareSession[]> {
    const now = Date.now();
    const sessions = await readSessions();
    const active = sessions.filter((s) => isFresh(s, now));

    if (active.length !== sessions.length) {
        await writeSessions(active);
    }

    return active;
}

/** Creates or updates (heartbeat) the device broadcast. A device broadcasts one content at a time. */
export async function upsertSession(
    input: Omit<ShareSession, 'updatedAt'>
): Promise<ShareSession> {
    const now = Date.now();
    const sessions = (await readSessions()).filter(
        (s) => s.deviceId !== input.deviceId && isFresh(s, now)
    );

    const session: ShareSession = { ...input, updatedAt: now };
    sessions.push(session);
    await writeSessions(sessions);
    return session;
}

/** Ends a device broadcast. */
export async function endSession(deviceId: string): Promise<void> {
    const now = Date.now();
    const sessions = await readSessions();
    const remaining = sessions.filter((s) => s.deviceId !== deviceId && isFresh(s, now));
    await writeSessions(remaining);
}

async function readCredentials(): Promise<StoredCredentials | null> {
    try {
        const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        const creds = parsed?.credentials;
        if (creds?.hostUrl && creds?.username && creds?.password) {
            return creds;
        }
        return null;
    } catch {
        return null;
    }
}

/** URL upstream real de um canal ao vivo (HLS), montada a partir da conta salva no servidor. */
export async function buildUpstreamLiveUrl(streamId: string): Promise<string | null> {
    const creds = await readCredentials();
    if (!creds) return null;
    const base = creds.hostUrl.replace(/\/$/, '');
    return `${base}/live/${creds.username}/${creds.password}/${streamId}.m3u8`;
}

/** Real upstream URL of a VOD (movie or series episode), from the account saved on the server. */
export async function buildUpstreamVodUrl(
    type: 'movie' | 'series',
    streamId: string,
    ext: string
): Promise<string | null> {
    const creds = await readCredentials();
    if (!creds) return null;
    const base = creds.hostUrl.replace(/\/$/, '');
    const segment = type === 'series' ? 'series' : 'movie';
    return `${base}/${segment}/${creds.username}/${creds.password}/${streamId}.${ext}`;
}

/** Origem (protocolo+host+porta) da conta configurada, usada para barrar proxy aberto no relay. */
export async function getAllowedOrigin(): Promise<string | null> {
    const creds = await readCredentials();
    if (!creds) return null;
    try {
        return new URL(creds.hostUrl).origin;
    } catch {
        return null;
    }
}
