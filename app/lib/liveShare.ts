import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

interface StoredCredentials {
    hostUrl: string;
    username: string;
    password: string;
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
