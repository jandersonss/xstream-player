import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { buildUpstreamVodUrl } from './liveShare';

/**
 * Transforma um VOD (arquivo mp4/mkv) numa transmissão HLS "ao vivo" via ffmpeg.
 *
 * Um único processo ffmpeg lê o arquivo do provedor (UMA conexão upstream) em
 * tempo real (`-re`) e o segmenta numa janela HLS deslizante. Vários espectadores
 * consomem esses segmentos pelo relay, entrando na borda ao vivo — igual a um
 * canal. Assim N pessoas assistindo o mesmo filme = ~1 conexão no provedor.
 *
 * Cuidados contra corridas de diretório:
 *  - Cada execução usa um diretório ÚNICO (inclui PID + timestamp + contador).
 *  - NUNCA apagamos a pasta raiz compartilhada (outro processo/instância — ex.:
 *    `next dev` recompilando — poderia estar transmitindo lá dentro).
 *  - A limpeza remove só diretórios OBSOLETOS (mtime antigo), nunca um ativo.
 */

export type VodType = 'movie' | 'series';

const ROOT_DIR = path.join(os.tmpdir(), 'xstream-vod');
const IDLE_TIMEOUT_MS = 45 * 1000;
const MAX_BROADCASTS = 3;
const REAP_INTERVAL_MS = 15 * 1000;
const SEGMENT_DURATION = 4;
/** Diretório sem escrita há mais que isso é considerado órfão e pode ser varrido. */
const STALE_DIR_MS = 3 * 60 * 1000;

interface Broadcast {
    key: string;
    dir: string;
    proc: ChildProcess;
    lastAccess: number;
    startedAt: number;
    alive: boolean;
}

type EnsureResult = { key: string; dir: string } | { error: string };

const broadcasts = new Map<string, Broadcast>();
/** Starts em andamento — evita que dois requests iniciem a mesma transmissão em paralelo. */
const starting = new Map<string, Promise<EnsureResult>>();
let runCounter = 0;

function keyFor(type: VodType, streamId: string): string {
    return `${type}_${streamId}`;
}

function isValidSegmentName(name: string): boolean {
    return /^seg_\d+\.m4s$/.test(name) || name === 'init.mp4';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Para uma transmissão ESPECÍFICA (o objeto), sem afetar outra execução na mesma chave. */
function stopBroadcast(b: Broadcast) {
    b.alive = false;
    try {
        b.proc.kill('SIGKILL');
    } catch {
        /* ignore */
    }
    if (broadcasts.get(b.key) === b) {
        broadcasts.delete(b.key);
    }
    fsp.rm(b.dir, { recursive: true, force: true }).catch(() => {});
}

/**
 * Remove apenas diretórios órfãos (mtime antigo) da raiz — seguro entre processos,
 * pois um diretório em uso tem mtime recente (o ffmpeg escreve segmentos o tempo todo).
 */
async function sweepStaleDirs() {
    let entries: string[];
    try {
        entries = await fsp.readdir(ROOT_DIR);
    } catch {
        return; // raiz ainda não existe
    }
    const now = Date.now();
    await Promise.all(
        entries.map(async (name) => {
            const full = path.join(ROOT_DIR, name);
            try {
                const st = await fsp.stat(full);
                if (st.isDirectory() && now - st.mtimeMs > STALE_DIR_MS) {
                    await fsp.rm(full, { recursive: true, force: true }).catch(() => {});
                }
            } catch {
                /* ignore */
            }
        })
    );
}

let reaper: NodeJS.Timeout | null = null;
function ensureReaper() {
    if (reaper) return;
    reaper = setInterval(() => {
        const now = Date.now();
        for (const b of broadcasts.values()) {
            if (!b.alive || now - b.lastAccess > IDLE_TIMEOUT_MS) {
                stopBroadcast(b);
            }
        }
        void sweepStaleDirs();
    }, REAP_INTERVAL_MS);
    if (typeof reaper.unref === 'function') reaper.unref();
}

function spawnFfmpeg(key: string, dir: string, upstreamUrl: string): Broadcast {
    const args = [
        '-hide_banner',
        '-loglevel', 'error',
        '-re',
        '-i', upstreamUrl,
        '-c', 'copy',
        '-f', 'hls',
        '-hls_time', String(SEGMENT_DURATION),
        '-hls_list_size', '6',
        '-hls_flags', 'delete_segments+omit_endlist',
        // fMP4 é consumido nativamente pelo MSE do navegador (TS exigiria transmux
        // pelo hls.js, que falha em alguns players → DEMUXER_ERROR_COULD_NOT_PARSE).
        '-hls_segment_type', 'fmp4',
        '-hls_fmp4_init_filename', 'init.mp4',
        '-hls_segment_filename', path.join(dir, 'seg_%05d.m4s'),
        path.join(dir, 'index.m3u8'),
    ];

    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });

    const broadcast: Broadcast = {
        key,
        dir,
        proc,
        lastAccess: Date.now(),
        startedAt: Date.now(),
        alive: true,
    };

    proc.stderr?.on('data', (chunk) => {
        console.error(`[VodBroadcast ${key}] ffmpeg: ${String(chunk).trim()}`);
    });
    proc.on('exit', (code) => {
        console.log(`[VodBroadcast ${key}] ffmpeg saiu (code ${code})`);
        broadcast.alive = false;
    });

    return broadcast;
}

/**
 * Garante que existe uma transmissão HLS ativa para o VOD e devolve seu diretório.
 * Faz spawn do ffmpeg na primeira vez (lazy), com trava de concorrência por chave.
 */
export async function ensureVodBroadcast(
    type: VodType,
    streamId: string,
    ext: string
): Promise<EnsureResult> {
    ensureReaper();

    const key = keyFor(type, streamId);

    const existing = broadcasts.get(key);
    if (existing && existing.alive) {
        existing.lastAccess = Date.now();
        return { key, dir: existing.dir };
    }

    const pending = starting.get(key);
    if (pending) return pending;

    const startPromise = (async (): Promise<EnsureResult> => {
        const stale = broadcasts.get(key);
        if (stale && !stale.alive) {
            stopBroadcast(stale);
        }

        if (broadcasts.size >= MAX_BROADCASTS) {
            return { error: 'Limite de transmissões simultâneas atingido' };
        }

        const upstreamUrl = await buildUpstreamVodUrl(type, streamId, ext);
        if (!upstreamUrl) {
            return { error: 'Conta não configurada' };
        }

        // Único por processo (PID) + timestamp + contador → nunca colide entre instâncias.
        const dir = path.join(ROOT_DIR, `${key}-p${process.pid}-${Date.now().toString(36)}-${runCounter++}`);
        await fsp.mkdir(dir, { recursive: true });

        const broadcast = spawnFfmpeg(key, dir, upstreamUrl);
        broadcasts.set(key, broadcast);
        return { key, dir };
    })();

    starting.set(key, startPromise);
    try {
        return await startPromise;
    } finally {
        starting.delete(key);
    }
}

/** Marca acesso (para o reaper não matar uma transmissão em uso). */
export function touchBroadcast(key: string): boolean {
    const b = broadcasts.get(key);
    if (!b || !b.alive) return false;
    b.lastAccess = Date.now();
    return true;
}

export function getBroadcastDir(key: string): string | null {
    const b = broadcasts.get(key);
    return b && b.alive ? b.dir : null;
}

/** Existe uma transmissão viva para este VOD? (para o Modo TV / join). */
export function hasBroadcast(key: string): boolean {
    const b = broadcasts.get(key);
    return Boolean(b && b.alive);
}

/**
 * Espera o index.m3u8 existir e conter ao menos um segmento (o ffmpeg leva ~1
 * duração de segmento em tempo real para produzir o primeiro). Aborta cedo se o
 * ffmpeg morrer (codec incompatível, provedor recusou, etc.).
 */
export async function waitForPlaylist(key: string, dir: string, timeoutMs = 20000): Promise<string | null> {
    const playlistPath = path.join(dir, 'index.m3u8');
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        try {
            const content = await fsp.readFile(playlistPath, 'utf-8');
            if (content.includes('#EXTINF')) {
                return content; // já tem ao menos um segmento
            }
        } catch {
            /* ainda não criado */
        }
        if (!hasBroadcast(key)) {
            return null; // ffmpeg morreu — não adianta esperar.
        }
        await sleep(300);
    }
    return null;
}

/** Lê um segmento .ts da transmissão (valida o nome para evitar path traversal). */
export async function readSegment(key: string, name: string): Promise<Buffer | null> {
    if (!isValidSegmentName(name)) return null;
    const dir = getBroadcastDir(key);
    if (!dir) return null;
    touchBroadcast(key);
    try {
        return await fsp.readFile(path.join(dir, name));
    } catch {
        return null;
    }
}

// Varredura inicial de órfãos (uma vez por processo). NÃO apaga a raiz inteira —
// só diretórios com mtime antigo, então nunca remove transmissão viva de outro processo.
const cleanupFlag = globalThis as unknown as { __xstreamVodSwept?: boolean };
if (!cleanupFlag.__xstreamVodSwept) {
    cleanupFlag.__xstreamVodSwept = true;
    void sweepStaleDirs();
}
