import fs from 'fs/promises';
import path from 'path';

/**
 * Estado de sincronização de reprodução entre players que compartilham a MESMA
 * transmissão (um transmissor + N espectadores no Modo TV).
 *
 * A métrica comum é a "latência ao vivo": distância, em segundos, entre a posição
 * atual e a borda ao vivo (`seekable.end`). Como todos consomem a MESMA janela HLS
 * deslizante (servida pelo relay/ffmpeg), a borda ao vivo é o mesmo instante de
 * mídia para todos — então "8s atrás da borda" é o mesmo quadro em qualquer player.
 * Sincronizar A ao B = igualar a latência (ajustando o currentTime).
 *
 * Persistimos em `data/` (e não em memória) porque a app pode rodar em mais de uma
 * instância / com a pasta `data` compartilhada entre aparelhos: só o arquivo é
 * visível a todos os processos. Mesmo padrão das sessões do Modo TV.
 */

const DATA_DIR = path.join(process.cwd(), 'data');
const SYNC_PATH = path.join(DATA_DIR, 'live-sync.json');

/** Participante sem heartbeat há mais que isso é descartado. */
const PARTICIPANT_TTL_MS = 15 * 1000;
/** Comando de "sincronizar" mais antigo que isso é ignorado (evita re-seek eterno). */
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

/** Remove participantes/comandos vencidos e streams vazias. Devolve se algo mudou. */
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

/** Registra/atualiza a latência de um participante e devolve o estado atual da transmissão. */
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

/** O transmissor pede que os espectadores dessincronizados pulem para a latência-alvo. */
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

/** Lê o estado atual, descartando (e persistindo) participantes/comandos vencidos. */
export async function getSyncState(streamKey: string): Promise<SyncState> {
    const now = Date.now();
    const store = await readStore();
    if (pruneStore(store, now)) {
        await writeStore(store);
    }
    return snapshot(store[streamKey]);
}
