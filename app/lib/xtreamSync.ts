import 'server-only';

import type { CachedCategory, CachedStream, ContentType } from './dbTypes';
import * as sqlite from './sqliteCache';

export interface XtreamCredentials {
    hostUrl: string;
    username: string;
    password: string;
}

export interface SyncProgressUpdate {
    progress: number;
    message: string;
    type?: ContentType;
    processed?: number;
    total?: number;
}

interface SyncStep {
    type: ContentType;
    categoryAction: string;
    streamAction: string;
    progressStart: number;
    progressWeight: number;
}

const SYNC_STEPS: SyncStep[] = [
    { type: 'live', categoryAction: 'get_live_categories', streamAction: 'get_live_streams', progressStart: 0, progressWeight: 15 },
    { type: 'movie', categoryAction: 'get_vod_categories', streamAction: 'get_vod_streams', progressStart: 15, progressWeight: 75 },
    { type: 'series', categoryAction: 'get_series_categories', streamAction: 'get_series', progressStart: 90, progressWeight: 10 },
];

const SQLITE_BATCH_SIZE = 1000;

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    return String(value);
}

function numberValue(value: unknown): number {
    if (typeof value === 'number') return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function stringArrayValue(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    return value.filter(item => typeof item === 'string');
}

function mapCategory(item: unknown, type: ContentType): CachedCategory {
    const record = asRecord(item);

    return {
        category_id: String(record.category_id ?? ''),
        category_name: String(record.category_name ?? ''),
        parent_id: numberValue(record.parent_id),
        type,
    };
}

function mapStream(item: unknown, type: ContentType): CachedStream {
    const record = asRecord(item);

    return {
        id: String(record.stream_id ?? record.series_id ?? ''),
        category_id: String(record.category_id ?? ''),
        name: String(record.name ?? ''),
        type,
        icon: stringValue(record.stream_icon) ?? stringValue(record.cover),
        rating: stringValue(record.rating),
        added: stringValue(record.added),
        container_extension: stringValue(record.container_extension),
        epg_channel_id: stringValue(record.epg_channel_id),
        stream_type: stringValue(record.stream_type),
        cover: stringValue(record.cover),
        plot: stringValue(record.plot),
        cast: stringValue(record.cast),
        director: stringValue(record.director),
        genre: stringValue(record.genre),
        release_date: stringValue(record.releaseDate) ?? stringValue(record.release_date),
        rating_5based: stringValue(record.rating_5based),
        backdrop_path: stringArrayValue(record.backdrop_path),
        last_modified: stringValue(record.last_modified),
    };
}

async function yieldToEventLoop() {
    await new Promise(resolve => setTimeout(resolve, 0));
}

async function fetchWithRetry(url: string, action: string, signal: AbortSignal, maxRetries = 3): Promise<Response> {
    let response: Response | undefined;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

        try {
            response = await fetch(url, { signal });
            if (response.ok || response.status < 500) break;
        } catch (error) {
            lastError = error;
        }

        if (attempt < maxRetries) {
            console.warn(`[ServerSync] Retry ${attempt + 1}/${maxRetries} for ${action}`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    if (!response) {
        throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${action}`);
    }

    return response;
}

async function fetchXtreamArray(credentials: XtreamCredentials, action: string, signal: AbortSignal): Promise<unknown[]> {
    const baseUrl = credentials.hostUrl.replace(/\/$/, '');
    const params = new URLSearchParams({
        username: credentials.username,
        password: credentials.password,
        action,
    });
    const response = await fetchWithRetry(`${baseUrl}/player_api.php?${params.toString()}`, action, signal);

    if (!response.ok) {
        throw new Error(`Xtream action ${action} failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
}

export async function syncXtreamToSqlite(
    credentials: XtreamCredentials,
    signal: AbortSignal,
    onProgress: (update: SyncProgressUpdate) => void
) {
    for (const step of SYNC_STEPS) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

        onProgress({
            progress: step.progressStart,
            message: `Sincronizando categorias de ${step.type}`,
            type: step.type,
        });

        const rawCategories = await fetchXtreamArray(credentials, step.categoryAction, signal);
        const categories = rawCategories
            .map(item => mapCategory(item, step.type))
            .filter(category => category.category_id);

        sqlite.saveCategories(categories);
        sqlite.pruneCategories(step.type, categories.map(category => category.category_id));

        onProgress({
            progress: step.progressStart,
            message: `Baixando lista de ${step.type}`,
            type: step.type,
        });

        const rawStreams = await fetchXtreamArray(credentials, step.streamAction, signal);
        const total = rawStreams.length;
        let processed = 0;
        const keepIds: string[] = [];

        for (let index = 0; index < total; index += SQLITE_BATCH_SIZE) {
            if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

            const batch = rawStreams
                .slice(index, index + SQLITE_BATCH_SIZE)
                .map(item => mapStream(item, step.type))
                .filter(stream => stream.id && stream.category_id && stream.name);

            sqlite.saveStreams(batch);
            keepIds.push(...batch.map(stream => String(stream.id)));
            processed += batch.length;

            const fraction = total > 0 ? Math.min(1, processed / total) : 1;
            onProgress({
                progress: Math.round(step.progressStart + fraction * step.progressWeight),
                message: `Gravando ${step.type} no SQLite`,
                type: step.type,
                processed,
                total,
            });

            await yieldToEventLoop();
        }

        // Only after the whole listing arrived, so a half-finished step never
        // deletes content the provider still has.
        const removed = sqlite.pruneStreams(step.type, keepIds);
        if (removed > 0) {
            console.log(`[ServerSync] Removed ${removed} ${step.type} entries no longer offered by the provider`);
        }
    }

    const timestamp = Date.now();
    sqlite.saveSyncMetadata({ type: 'categories', lastSync: timestamp });

    onProgress({
        progress: 100,
        message: 'Sincronizacao concluida',
    });

    return timestamp;
}
