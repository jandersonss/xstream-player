import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const SESSIONS_PATH = path.join(DATA_DIR, 'live-sessions.json');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

/** Uma sessão é considerada morta se não recebe heartbeat há mais que isso. */
export const SESSION_TTL_MS = 45 * 1000;
/** Intervalo sugerido de heartbeat para o cliente (menor que o TTL). */
export const HEARTBEAT_MS = 20 * 1000;

export type ShareContentType = 'live' | 'movie' | 'series';

export interface ShareSession {
    /** Identidade estável do aparelho (também é a chave da sessão). */
    deviceId: string;
    deviceName: string;
    contentType: ShareContentType;
    /** stream_id do Xtream (canal, filme ou episódio). */
    streamId: string;
    title: string;
    poster?: string;
    /** Extensão do arquivo VOD (mp4/mkv…), para iniciar o relay do VOD. */
    ext?: string;
    /** Para séries: id da série (streamId é o id do episódio). */
    seriesId?: string;
    /** IP de LAN do aparelho (best-effort), via WebRTC no cliente ou header no servidor. */
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

/** Lista as transmissões ativas, descartando (e persistindo) as expiradas. */
export async function listActiveSessions(): Promise<ShareSession[]> {
    const now = Date.now();
    const sessions = await readSessions();
    const active = sessions.filter((s) => isFresh(s, now));

    if (active.length !== sessions.length) {
        await writeSessions(active);
    }

    return active;
}

/** Cria ou atualiza (heartbeat) a transmissão do aparelho. Um aparelho transmite um conteúdo por vez. */
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

/** Encerra a transmissão de um aparelho. */
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

/** URL upstream real de um VOD (filme ou episódio de série), a partir da conta salva no servidor. */
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
