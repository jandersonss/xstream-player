import { NextResponse } from 'next/server';
import { enforceRemoteAccessForApi } from '@/app/lib/remoteAccess';
import { buildUpstreamLiveUrl, getAllowedOrigin } from '@/app/lib/liveShare';

export const runtime = 'nodejs';

/**
 * Shared HLS relay for live channels.
 *
 * All viewers pull the stream through here; the server does ONE read per
 * playlist/segment (via a short cache that coalesces concurrent requests) and
 * fans it out to everyone. So N devices watching the same channel count as
 * ~1 connection on the Xtream provider.
 *
 * Xtream providers usually answer the .m3u8 with a 302 to a CDN on ANOTHER
 * (tokenized) origin. Hence: we rewrite using the final (post-redirect) URL
 * and dynamically allowlist the origins the provider redirects us to.
 */

const PLAYLIST_TTL_MS = 2 * 1000;
const SEGMENT_TTL_MS = 15 * 1000;
const MAX_CACHED_SEGMENTS = 48;
const MAX_SEGMENT_CACHE_BYTES = 4 * 1024 * 1024;

interface CacheEntry {
    body: ArrayBuffer;
    contentType: string;
    /** Effective URL after redirects — the correct base for rewriting the playlist. */
    finalUrl: string;
    expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<CacheEntry>>();

/** Allowlisted origins: the account's + the ones the provider redirects to. */
const allowedOrigins = new Set<string>();

function pruneSegmentCache() {
    if (cache.size <= MAX_CACHED_SEGMENTS) return;
    // Remove the oldest entries (Map preserves insertion order).
    const excess = cache.size - MAX_CACHED_SEGMENTS;
    let removed = 0;
    for (const key of cache.keys()) {
        cache.delete(key);
        if (++removed >= excess) break;
    }
}

/** Busca upstream (seguindo redirects) coalescendo chamadas concorrentes. */
async function fetchShared(targetUrl: string, ttl: number): Promise<CacheEntry> {
    const now = Date.now();
    const cached = cache.get(targetUrl);
    if (cached && cached.expiresAt > now) {
        return cached;
    }

    const existing = inFlight.get(targetUrl);
    if (existing) return existing;

    const promise = (async () => {
        const upstream = await fetch(targetUrl, { redirect: 'follow' });
        if (!upstream.ok) {
            throw new Error(`Upstream ${upstream.status}`);
        }
        const finalUrl = upstream.url || targetUrl;
        // Allow the final origin (the CDN the provider redirected to).
        try {
            allowedOrigins.add(new URL(finalUrl).origin);
        } catch {
            /* ignore */
        }

        const body = await upstream.arrayBuffer();
        const entry: CacheEntry = {
            body,
            contentType: upstream.headers.get('content-type') || 'application/octet-stream',
            finalUrl,
            expiresAt: Date.now() + ttl,
        };
        if (body.byteLength <= MAX_SEGMENT_CACHE_BYTES) {
            cache.set(targetUrl, entry);
            pruneSegmentCache();
        }
        return entry;
    })();

    inFlight.set(targetUrl, promise);
    try {
        return await promise;
    } finally {
        inFlight.delete(targetUrl);
    }
}

function looksLikePlaylist(url: string, contentType: string): boolean {
    return url.includes('.m3u8') || contentType.includes('mpegurl');
}

/** Rewrites an HLS playlist so child playlists/segments also go through the relay. */
function rewritePlaylist(text: string, baseUrl: string): string {
    const toRelay = (rawRef: string): string => {
        try {
            const abs = new URL(rawRef, baseUrl).toString();
            return `/api/relay?src=${encodeURIComponent(abs)}`;
        } catch {
            return rawRef;
        }
    };

    return text
        .split('\n')
        .map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return line;

            if (trimmed.startsWith('#')) {
                // Reescreve o atributo URI="..." de tags como EXT-X-KEY / EXT-X-MEDIA.
                return line.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${toRelay(uri)}"`);
            }

            // Linha de URI (playlist variante ou segmento).
            return toRelay(trimmed);
        })
        .join('\n');
}

async function resolveTarget(request: Request): Promise<{ url: string } | { error: NextResponse }> {
    const { searchParams } = new URL(request.url);
    const src = searchParams.get('src');
    const streamId = searchParams.get('streamId');
    const type = searchParams.get('type');

    const accountOrigin = await getAllowedOrigin();
    if (!accountOrigin) {
        return { error: NextResponse.json({ error: 'Conta não configurada' }, { status: 503 }) };
    }
    allowedOrigins.add(accountOrigin);

    if (src) {
            // Open-proxy guard: only relay the account origin or the CDNs it redirects to.
        let origin: string;
        try {
            origin = new URL(src).origin;
        } catch {
            return { error: NextResponse.json({ error: 'src inválido' }, { status: 400 }) };
        }
        if (!allowedOrigins.has(origin)) {
            return { error: NextResponse.json({ error: 'Origem não permitida' }, { status: 403 }) };
        }
        return { url: src };
    }

    if (streamId && type === 'live') {
        const upstream = await buildUpstreamLiveUrl(streamId);
        if (!upstream) {
            return { error: NextResponse.json({ error: 'Conta não configurada' }, { status: 503 }) };
        }
        return { url: upstream };
    }

    return { error: NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 }) };
}

export async function GET(request: Request) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    const resolved = await resolveTarget(request);
    if ('error' in resolved) return resolved.error;

    const targetUrl = resolved.url;
    const playlistHint = targetUrl.includes('.m3u8');

    try {
        const entry = await fetchShared(targetUrl, playlistHint ? PLAYLIST_TTL_MS : SEGMENT_TTL_MS);

        if (looksLikePlaylist(entry.finalUrl, entry.contentType)) {
            const text = Buffer.from(entry.body).toString('utf-8');
            // Base = final URL after redirects (where the segments actually live).
            const rewritten = rewritePlaylist(text, entry.finalUrl);
            return new NextResponse(rewritten, {
                status: 200,
                headers: {
                    'content-type': 'application/vnd.apple.mpegurl',
                    'cache-control': 'no-store',
                },
            });
        }

        return new NextResponse(entry.body, {
            status: 200,
            headers: {
                'content-type': entry.contentType || 'video/mp2t',
                'cache-control': 'no-store',
            },
        });
    } catch (error) {
        console.error('[Relay] erro:', error);
        return NextResponse.json({ error: 'Falha no relay' }, { status: 502 });
    }
}
