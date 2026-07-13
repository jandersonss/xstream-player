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
 * É efêmero e vale só enquanto os players estão ativos, então mantemos em memória
 * (sem tocar em disco a cada poucos segundos). Todos os aparelhos falam com o mesmo
 * servidor Next, então o Map é igualmente acessível a todos via a API.
 */

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
    participants: Map<string, Participant>;
    command?: { epoch: number; targetLatency: number };
}

export interface SyncParticipant {
    deviceId: string;
    role: SyncRole;
    latency: number;
}

export interface SyncState {
    participants: SyncParticipant[];
    command?: { epoch: number; targetLatency: number };
}

const streams = new Map<string, StreamSync>();

function prune(stream: StreamSync, now: number) {
    for (const [deviceId, p] of stream.participants) {
        if (now - p.updatedAt > PARTICIPANT_TTL_MS) {
            stream.participants.delete(deviceId);
        }
    }
    if (stream.command && now - stream.command.epoch > COMMAND_TTL_MS) {
        stream.command = undefined;
    }
}

function snapshot(stream: StreamSync): SyncState {
    const participants: SyncParticipant[] = [];
    for (const [deviceId, p] of stream.participants) {
        participants.push({ deviceId, role: p.role, latency: p.latency });
    }
    return { participants, command: stream.command };
}

/** Registra/atualiza a latência de um participante e devolve o estado atual da transmissão. */
export function reportParticipant(
    streamKey: string,
    deviceId: string,
    role: SyncRole,
    latency: number
): SyncState {
    const now = Date.now();
    let stream = streams.get(streamKey);
    if (!stream) {
        stream = { participants: new Map() };
        streams.set(streamKey, stream);
    }
    stream.participants.set(deviceId, { role, latency, updatedAt: now });
    prune(stream, now);
    return snapshot(stream);
}

/** O transmissor pede que os espectadores dessincronizados pulem para a latência-alvo. */
export function setSyncCommand(streamKey: string, targetLatency: number): SyncState {
    const now = Date.now();
    let stream = streams.get(streamKey);
    if (!stream) {
        stream = { participants: new Map() };
        streams.set(streamKey, stream);
    }
    stream.command = { epoch: now, targetLatency };
    prune(stream, now);
    return snapshot(stream);
}

/** Lê o estado atual (sem escrever), descartando participantes/comandos vencidos. */
export function getSyncState(streamKey: string): SyncState {
    const stream = streams.get(streamKey);
    if (!stream) return { participants: [] };
    prune(stream, Date.now());
    if (stream.participants.size === 0 && !stream.command) {
        streams.delete(streamKey);
        return { participants: [] };
    }
    return snapshot(stream);
}
