import fs from 'fs/promises';
import path from 'path';

/**
 * Playback sync state across players sharing the SAME broadcast
 * (one broadcaster + N viewers in TV Mode).
 *
 * The shared metric is "live latency": distance, in seconds, between the current
 * position and the live edge (`seekable.end`). Since everyone consumes the SAME
 * sliding HLS window (served by the relay/ffmpeg), the live edge is the same media
 * instant for all — so "8s behind the edge" is the same frame on any player.
 * Syncing A to B = matching the latency (by adjusting currentTime).
 *
 * We persist to `data/` (not memory) because the app may run in more than one
 * instance / with the `data` folder shared across devices: only the file is
 * visible to all processes. Same pattern as TV Mode sessions.
 */

const DATA_DIR = path.join(process.cwd(), 'data');
const SYNC_PATH = path.join(DATA_DIR, 'live-sync.json');

/** A participant without a heartbeat for longer than this is discarded. */
const PARTICIPANT_TTL_MS = 15 * 1000;
/** A "sync" command older than this is ignored (avoids endless re-seeking). */
const COMMAND_TTL_MS = 30 * 1000;

export type SyncRole = 'broadcaster' | 'viewer';

interface Participant {
    role: SyncRole;
    latency: number;
    updatedAt: number;
}

interface StreamSync {
    participants: Record<string, Participant>;
    command?: { epoch: number; targetLatency: number };
}

type Store = Record<string, StreamSync>;

export interface SyncParticipant {
    deviceId: string;
    role: SyncRole;
    latency: number;
}

export interface SyncState {
    participants: SyncParticipant[];
    command?: { epoch: number; targetLatency: number };
}

async function readStore(): Promise<Store> {
    try {
        const raw = await fs.readFile(SYNC_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            return {};
        }
        throw error;
    }
}

async function writeStore(store: Store): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(SYNC_PATH, JSON.stringify(store, null, 2));
}

/** Removes expired participants/commands and empty streams. Returns whether anything changed. */
function pruneStore(store: Store, now: number): boolean {
    let changed = false;
    for (const [key, stream] of Object.entries(store)) {
        for (const [deviceId, p] of Object.entries(stream.participants)) {
            if (now - p.updatedAt > PARTICIPANT_TTL_MS) {
                delete stream.participants[deviceId];
                changed = true;
            }
        }
        if (stream.command && now - stream.command.epoch > COMMAND_TTL_MS) {
            stream.command = undefined;
            changed = true;
        }
        if (Object.keys(stream.participants).length === 0 && !stream.command) {
            delete store[key];
            changed = true;
        }
    }
    return changed;
}

function snapshot(stream: StreamSync | undefined): SyncState {
    if (!stream) return { participants: [] };
    const participants: SyncParticipant[] = Object.entries(stream.participants).map(
        ([deviceId, p]) => ({ deviceId, role: p.role, latency: p.latency })
    );
    return { participants, command: stream.command };
}

/** Records/updates a participant's latency and returns the broadcast's current state. */
export async function reportParticipant(
    streamKey: string,
    deviceId: string,
    role: SyncRole,
    latency: number
): Promise<SyncState> {
    const now = Date.now();
    const store = await readStore();
    pruneStore(store, now);

    const stream = store[streamKey] ?? { participants: {} };
    stream.participants[deviceId] = { role, latency, updatedAt: now };
    store[streamKey] = stream;

    await writeStore(store);
    return snapshot(stream);
}

/** The broadcaster asks out-of-sync viewers to jump to the target latency. */
export async function setSyncCommand(streamKey: string, targetLatency: number): Promise<SyncState> {
    const now = Date.now();
    const store = await readStore();
    pruneStore(store, now);

    const stream = store[streamKey] ?? { participants: {} };
    stream.command = { epoch: now, targetLatency };
    store[streamKey] = stream;

    await writeStore(store);
    return snapshot(stream);
}

/** Reads the current state, discarding (and persisting) expired participants/commands. */
export async function getSyncState(streamKey: string): Promise<SyncState> {
    const now = Date.now();
    const store = await readStore();
    if (pruneStore(store, now)) {
        await writeStore(store);
    }
    return snapshot(store[streamKey]);
}
