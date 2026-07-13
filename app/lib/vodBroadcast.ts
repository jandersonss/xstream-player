import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { buildUpstreamVodUrl } from './liveShare';

/**
 * Turns a VOD (mp4/mkv file) into a "live" HLS broadcast via ffmpeg.
 *
 * A single ffmpeg process reads the provider file (ONE upstream connection) in
 * real time (`-re`) and segments it into a sliding HLS window. Multiple viewers
 * consume those segments through the relay, joining at the live edge — just like a
 * channel. So N people watching the same movie = ~1 connection on the provider.
 *
 * Guards against directory races:
 *  - Each run uses a UNIQUE directory (includes PID + timestamp + counter).
 *  - We NEVER delete the shared root folder (another process/instance — e.g.
 *    `next dev` recompiling — could be broadcasting inside it).
 *  - Cleanup only removes STALE directories (old mtime), never an active one.
 */

export type VodType = 'movie' | 'series';

const ROOT_DIR = path.join(os.tmpdir(), 'xstream-vod');
const IDLE_TIMEOUT_MS = 45 * 1000;
const MAX_BROADCASTS = 3;
const REAP_INTERVAL_MS = 15 * 1000;
const SEGMENT_DURATION = 4;
/** A directory not written to for longer than this is treated as orphan and may be swept. */
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
/** In-flight starts — prevents two requests from starting the same broadcast in parallel. */
const starting = new Map<string, Promise<EnsureResult>>();
let runCounter = 0;

function keyFor(type: VodType, streamId: string): string {
    return `${type}_${streamId}`;
}

function isValidSegmentName(name: string): boolean {
    return /^seg_\d+\.m4s$/.test(name) || name === 'init.mp4';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Stops a SPECIFIC broadcast (the object), without affecting another run on the same key. */
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
 * Removes only orphan directories (old mtime) from the root — safe across processes,
 * since a directory in use has a recent mtime (ffmpeg writes segments constantly).
 */
async function sweepStaleDirs() {
    let entries: string[];
    try {
        entries = await fsp.readdir(ROOT_DIR);
    } catch {
        return; // root does not exist yet
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
        // fMP4 is consumed natively by the browser MSE (TS would require transmux
        // by hls.js, which fails on some players → DEMUXER_ERROR_COULD_NOT_PARSE).
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
 * Ensures an active HLS broadcast exists for the VOD and returns its directory.
 * Spawns ffmpeg on the first call (lazy), with a per-key concurrency lock.
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

        // Unique per process (PID) + timestamp + counter → never collides across instances.
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

/** Marks access (so the reaper does not kill a broadcast in use). */
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

/** Is there a live broadcast for this VOD? (for TV Mode / join). */
export function hasBroadcast(key: string): boolean {
    const b = broadcasts.get(key);
    return Boolean(b && b.alive);
}

/**
 * Waits for index.m3u8 to exist and contain at least one segment (ffmpeg takes ~1
 * segment duration in real time to produce the first). Aborts early if
 * ffmpeg dies (incompatible codec, provider refused, etc.).
 */
export async function waitForPlaylist(key: string, dir: string, timeoutMs = 20000): Promise<string | null> {
    const playlistPath = path.join(dir, 'index.m3u8');
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        try {
            const content = await fsp.readFile(playlistPath, 'utf-8');
            if (content.includes('#EXTINF')) {
                return content; // already has at least one segment
            }
        } catch {
            /* not created yet */
        }
        if (!hasBroadcast(key)) {
            return null; // ffmpeg died — no point waiting.
        }
        await sleep(300);
    }
    return null;
}

/** Reads a .ts segment from the broadcast (validates the name to avoid path traversal). */
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

// Initial orphan sweep (once per process). Does NOT delete the whole root —
// only directories with old mtime, so it never removes a live broadcast from another process.
const cleanupFlag = globalThis as unknown as { __xstreamVodSwept?: boolean };
if (!cleanupFlag.__xstreamVodSwept) {
    cleanupFlag.__xstreamVodSwept = true;
    void sweepStaleDirs();
}
