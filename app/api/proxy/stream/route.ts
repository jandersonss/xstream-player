import { NextResponse } from 'next/server';
import {
    responseCache,
    CACHE_TTL,
    getCacheKey,
    performPeriodicCleanup,
    fetchWithRetry,
    parseResponse
} from '../cache';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { hostUrl, username, password, action, ...otherParams } = body;

        if (!hostUrl || !username || !password) {
            return NextResponse.json(
                { error: 'Missing credentials' },
                { status: 400 }
            );
        }

        // Periodic cache cleanup
        performPeriodicCleanup();

        const baseUrl = hostUrl.replace(/\/$/, '');
        const cacheKey = getCacheKey(hostUrl, username, action);
        let cached = responseCache.get(cacheKey);

        // If no cache or expired, fetch from upstream first
        if (!cached || Date.now() - cached.timestamp > CACHE_TTL) {
            console.log(`[Proxy Stream] Fetching full data for ${action} (cache miss)`);

            const params = new URLSearchParams({
                username,
                password,
                action: action || '',
                ...otherParams
            });
            const apiUrl = `${baseUrl}/player_api.php?${params.toString()}`;

            const response = await fetchWithRetry(apiUrl, action);
            if (!response.ok) {
                return NextResponse.json(
                    { error: `Upstream error: ${response.statusText}` },
                    { status: response.status }
                );
            }

            const data = await parseResponse(response);

            if (Array.isArray(data)) {
                cached = { data, timestamp: Date.now(), total: data.length };
                responseCache.set(cacheKey, cached);
                console.log(`[Proxy Stream] Cached ${data.length} items for ${action}`);
            } else {
                // Non-array response, return directly
                return NextResponse.json(data);
            }
        }

        const items = cached.data;
        const total = cached.total;

        console.log(`[Proxy Stream] Streaming ${total} items for ${action}`);

        // Create a ReadableStream that yields NDJSON
        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                
                // Write header
                const header = { type: 'header', total, action };
                controller.enqueue(encoder.encode(JSON.stringify(header) + '\n'));

                // Yield items in chunks to avoid blocking the event loop too long
                const chunkSize = 1000;
                for (let i = 0; i < total; i += chunkSize) {
                    const chunk = items.slice(i, i + chunkSize);
                    let textChunk = '';
                    for (const item of chunk) {
                        textChunk += JSON.stringify({ type: 'item', data: item }) + '\n';
                    }
                    controller.enqueue(encoder.encode(textChunk));
                    
                    // Yield to event loop
                    await new Promise(resolve => setTimeout(resolve, 0));
                }

                // Write footer/done
                const footer = { type: 'done', total };
                controller.enqueue(encoder.encode(JSON.stringify(footer) + '\n'));
                
                controller.close();
            }
        });

        // Return the stream with NDJSON content type
        return new Response(stream, {
            headers: {
                'Content-Type': 'application/x-ndjson',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
                'X-Content-Type-Options': 'nosniff',
            },
        });

    } catch (error: any) {
        console.error('[Proxy Stream] CRITICAL Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', details: error.message },
            { status: 500 }
        );
    }
}
