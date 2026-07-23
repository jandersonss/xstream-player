import { spawn, type ChildProcess } from 'child_process';
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
 * Liveness is driven by PLAYBACK, not by downloads. Fetching a segment proves
 * nothing: on a DEMUXER_ERROR the browser keeps pulling segments with 200 OK while
 * the <video> is dead, which used to keep ffmpeg (and the upstream connection) alive
 * forever. Only the client knows whether frames advanced, so each device reports it
 * through `reportConsumer` and the broadcast lives while someone is really watching.
 *
 * Guards against directory races:
 *  - Each run uses a UNIQUE directory (includes PID + timestamp + counter).
 *  - We NEVER delete the shared root folder (another process/instance — e.g.
 *    `next dev` recompiling — could be broadcasting inside it).
 *  - Cleanup only removes STALE directories (old mtime), never an active one.
 */

export type VodType = 'movie' | 'series';

/** What a device reports about its own playback. */
export type ConsumerState = 'playing' | 'paused' | 'stalled';

const ROOT_DIR = path.join(os.tmpdir(), 'xstream-vod');
const MAX_BROADCASTS = 3;
const REAP_INTERVAL_MS = 5 * 1000;
const SEGMENT_DURATION = 4;
/** A device that stops reporting for longer than this no longer holds the broadcast. */
const CONSUMER_TTL_MS = 15 * 1000;
/** Between spawning ffmpeg and the first played frame there is no liveness signal yet. */
const STARTUP_GRACE_MS = 30 * 1000;
/** ffmpeg is stuck if it has not written a segment for ~3 segment durations. */
const STALL_TIMEOUT_MS = 3 * SEGMENT_DURATION * 1000;
/** After a forced stop, refuse to respawn for this long (a retrying player would resurrect it). */
const STOP_MARK_MS = 30 * 1000;
/** A directory not written to for longer than this is treated as orphan and may be swept. */
const STALE_DIR_MS = 3 * 60 * 1000;

interface Consumer {
    lastAlive: number;
    paused: boolean;
}

interface Broadcast {
    key: string;
    dir: string;
    proc: ChildProcess;
    /** Devices reporting active playback, by deviceId. */
    consumers: Map<string, Consumer>;
    startedAt: number;
    alive: boolean;
    /**
     * Bumped on every restart (seek). A restart resets the HLS timeline — segments and
     * MEDIA-SEQUENCE start over — which a viewer's hls.js cannot follow in place. Viewers
     * watch this number through the heartbeat and reload their player when it changes.
     */
    generation: number;
}

type EnsureResult = { key: string; dir: string } | { error: string };

const broadcasts = new Map<string, Broadcast>();
/** In-flight starts — prevents two requests from starting the same broadcast in parallel. */
const starting = new Map<string, Promise<EnsureResult>>();
/** Keys stopped on purpose, with the instant the block expires. */
const stopMarks = new Map<string, number>();
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
    b.consumers.clear();
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

/** Drops expired devices and returns how many are still reporting playback. */
function pruneConsumers(b: Broadcast, now: number): number {
    for (const [deviceId, consumer] of b.consumers) {
        if (now - consumer.lastAlive > CONSUMER_TTL_MS) {
            b.consumers.delete(deviceId);
        }
    }
    return b.consumers.size;
}

/**
 * ffmpeg can hang without ever emitting `exit` (upstream stalls mid-transfer), so
 * process liveness is not enough — what matters is whether segments keep appearing.
 * The directory mtime moves on every segment written or deleted by `delete_segments`.
 */
async function hasStalled(b: Broadcast, now: number): Promise<boolean> {
    try {
        const stat = await fsp.stat(b.dir);
        return now - stat.mtimeMs > STALL_TIMEOUT_MS;
    } catch {
        return true; // directory vanished — there is nothing left to serve
    }
}

async function reapOnce() {
    const now = Date.now();

    for (const b of [...broadcasts.values()]) {
        if (!b.alive) {
            stopBroadcast(b);
            continue;
        }
        if (now - b.startedAt < STARTUP_GRACE_MS) continue;

        if (pruneConsumers(b, now) === 0) {
            console.log(`[VodBroadcast ${b.key}] encerrado: nenhum aparelho reproduzindo`);
            stopBroadcast(b);
            continue;
        }
        if (await hasStalled(b, now)) {
            console.log(`[VodBroadcast ${b.key}] encerrado: ffmpeg parou de gerar segmentos`);
            stopBroadcast(b);
        }
    }

    for (const [key, expiresAt] of stopMarks) {
        if (now > expiresAt) stopMarks.delete(key);
    }

    await sweepStaleDirs();
}

let reaper: NodeJS.Timeout | null = null;
function ensureReaper() {
    if (reaper) return;
    reaper = setInterval(() => {
        void reapOnce();
    }, REAP_INTERVAL_MS);
    if (typeof reaper.unref === 'function') reaper.unref();
}

/** Unique per process (PID) + timestamp + counter → never collides across instances. */
function newRunDir(key: string): string {
    return path.join(ROOT_DIR, `${key}-p${process.pid}-${Date.now().toString(36)}-${runCounter++}`);
}

function spawnFfmpeg(key: string, dir: string, upstreamUrl: string, startSeconds: number): ChildProcess {
    const args = [
        '-hide_banner',
        '-loglevel', 'error',
        // Input seek (before -i): the provider serves the VOD with Range support, so
        // ffmpeg jumps straight to the byte offset instead of decoding from the start.
        // Lands on the nearest preceding keyframe, so precision is one GOP (~4s).
        ...(startSeconds > 0 ? ['-ss', String(startSeconds)] : []),
        '-re',
        '-i', upstreamUrl,
        '-c', 'copy',
        '-f', 'hls',
        '-hls_time', String(SEGMENT_DURATION),
        '-hls_list_size', '6',
        // program_date_time stamps every segment with an absolute instant, identical for
        // every device reading this playlist. It is what lets the players compare their
        // positions directly instead of each measuring against its own view of the edge.
        '-hls_flags', 'delete_segments+omit_endlist+program_date_time',
        // fMP4 is consumed natively by the browser MSE (TS would require transmux
        // by hls.js, which fails on some players → DEMUXER_ERROR_COULD_NOT_PARSE).
        '-hls_segment_type', 'fmp4',
        '-hls_fmp4_init_filename', 'init.mp4',
        '-hls_segment_filename', path.join(dir, 'seg_%05d.m4s'),
        path.join(dir, 'index.m3u8'),
    ];

    return spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
}

/**
 * Binds a process to the broadcast that owns it.
 *
 * The exit handler must check it is still the CURRENT process: a restart (seek) kills
 * the previous ffmpeg on purpose, and without this guard that deliberate kill would
 * mark the broadcast dead — dropping every viewer that was meant to follow along.
 */
function trackProc(b: Broadcast, proc: ChildProcess) {
    proc.stderr?.on('data', (chunk) => {
        console.error(`[VodBroadcast ${b.key}] ffmpeg: ${String(chunk).trim()}`);
    });
    proc.on('exit', (code) => {
        if (b.proc !== proc) return; // replaced by a restart
        console.log(`[VodBroadcast ${b.key}] ffmpeg saiu (code ${code})`);
        b.alive = false;
    });
}

/**
 * Ensures an active HLS broadcast exists for the VOD and returns its directory.
 * Spawns ffmpeg on the first call (lazy), with a per-key concurrency lock.
 *
 * `startSeconds` only takes effect when the broadcast is CREATED. Whoever starts it
 * picks where the "channel" begins; everyone joining afterwards lands wherever it is
 * playing now — exactly like tuning into a live channel. Changing the starting point
 * of a running broadcast means stopping it (killBroadcast) and starting over.
 */
export async function ensureVodBroadcast(
    type: VodType,
    streamId: string,
    ext: string,
    startSeconds = 0
): Promise<EnsureResult> {
    ensureReaper();

    const key = keyFor(type, streamId);

    const existing = broadcasts.get(key);
    if (existing && existing.alive) {
        return { key, dir: existing.dir };
    }

    const pending = starting.get(key);
    if (pending) return pending;

    const startPromise = (async (): Promise<EnsureResult> => {
        const stale = broadcasts.get(key);
        if (stale && !stale.alive) {
            stopBroadcast(stale);
        }

        const stopMark = stopMarks.get(key);
        if (stopMark && Date.now() < stopMark) {
            return { error: 'Transmissão encerrada' };
        }

        if (broadcasts.size >= MAX_BROADCASTS) {
            return { error: 'Limite de transmissões simultâneas atingido' };
        }

        const upstreamUrl = await buildUpstreamVodUrl(type, streamId, ext);
        if (!upstreamUrl) {
            return { error: 'Conta não configurada' };
        }

        const dir = newRunDir(key);
        await fsp.mkdir(dir, { recursive: true });

        if (startSeconds > 0) {
            console.log(`[VodBroadcast ${key}] iniciando em ${Math.round(startSeconds)}s`);
        }
        const proc = spawnFfmpeg(key, dir, upstreamUrl, startSeconds);
        const broadcast: Broadcast = {
            key,
            dir,
            proc,
            consumers: new Map(),
            startedAt: Date.now(),
            alive: true,
            generation: 1,
        };
        trackProc(broadcast, proc);
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

/**
 * Moves a running broadcast to another point of the title (seek from the broadcaster).
 *
 * The sliding HLS window only holds ~30s, so jumping outside it means re-reading the
 * upstream from a new offset — there is nothing else to serve. The Broadcast object is
 * REUSED (only its process and directory are swapped) so registered devices are never
 * seen as gone: dropping them would make every viewer's heartbeat report the broadcast
 * as ended and kick them out of the player.
 *
 * `startedAt` is reset, which re-arms the startup grace — viewers whose hls.js stumbles
 * on the swap have time to recover before the reaper counts them as absent.
 */
export async function restartVodBroadcast(
    type: VodType,
    streamId: string,
    ext: string,
    startSeconds: number
): Promise<EnsureResult> {
    const key = keyFor(type, streamId);
    const b = broadcasts.get(key);
    if (!b || !b.alive) {
        // Nothing running (it may have just been reaped) — a plain start is the same thing.
        return ensureVodBroadcast(type, streamId, ext, startSeconds);
    }

    const upstreamUrl = await buildUpstreamVodUrl(type, streamId, ext);
    if (!upstreamUrl) {
        return { error: 'Conta não configurada' };
    }

    const dir = newRunDir(key);
    await fsp.mkdir(dir, { recursive: true });

    console.log(`[VodBroadcast ${key}] reiniciando em ${Math.round(startSeconds)}s`);

    const oldProc = b.proc;
    const oldDir = b.dir;

    const proc = spawnFfmpeg(key, dir, upstreamUrl, startSeconds);
    b.proc = proc;
    b.dir = dir;
    b.startedAt = Date.now();
    b.generation += 1;
    trackProc(b, proc);

    try {
        oldProc.kill('SIGKILL');
    } catch {
        /* ignore */
    }
    fsp.rm(oldDir, { recursive: true, force: true }).catch(() => {});

    return { key, dir };
}

/**
 * Records what a device is doing with the broadcast. Returns whether the broadcast
 * still exists, so the client can give up instead of retrying forever.
 *
 * `paused` counts as watching (the viewer is there, deliberately stopped); `stalled`
 * releases the device immediately, without waiting out the TTL.
 */
export function reportConsumer(key: string, deviceId: string, state: ConsumerState): boolean {
    const b = broadcasts.get(key);
    if (!b || !b.alive) return false;

    if (state === 'stalled') {
        b.consumers.delete(deviceId);
    } else {
        b.consumers.set(deviceId, { lastAlive: Date.now(), paused: state === 'paused' });
    }
    return true;
}

/** Releases a device from the broadcast (left the player, closed the page). */
export function dropConsumer(key: string, deviceId: string): void {
    broadcasts.get(key)?.consumers.delete(deviceId);
}

/**
 * Forced stop, from the TV Mode screen. Blocks respawn for a while: a paused player
 * keeps reloading the playlist and would otherwise bring ffmpeg straight back.
 */
export function killBroadcast(key: string): boolean {
    stopMarks.set(key, Date.now() + STOP_MARK_MS);
    const b = broadcasts.get(key);
    if (!b) return false;
    console.log(`[VodBroadcast ${key}] encerrado manualmente`);
    stopBroadcast(b);
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
 * Current generation of a live broadcast, or 0 when none. A change means the timeline
 * was reset by a seek and viewers must reload their player.
 */
export function getBroadcastGeneration(key: string): number {
    const b = broadcasts.get(key);
    return b && b.alive ? b.generation : 0;
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

/**
 * Reads a segment from the broadcast (validates the name to avoid path traversal).
 * Deliberately does NOT extend the broadcast lifetime — see the note at the top of
 * the file: downloading is not watching.
 */
export async function readSegment(key: string, name: string): Promise<Buffer | null> {
    if (!isValidSegmentName(name)) return null;
    const dir = getBroadcastDir(key);
    if (!dir) return null;
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
