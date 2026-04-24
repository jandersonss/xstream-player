import { NextResponse } from 'next/server';

/**
 * Server-side cache for large API responses.
 * Since this runs as a standalone Next.js server (not serverless),
 * the process persists and we can cache in memory.
 * 
 * Key: hash of (hostUrl + username + action)
 * Value: { data: any[], timestamp: number }
 * TTL: 5 minutes (enough for sync to complete)
 */
const responseCache = new Map<string, { data: any[]; timestamp: number; total: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(hostUrl: string, username: string, action: string): string {
    return `${hostUrl}:${username}:${action}`;
}

function cleanExpiredCache() {
    const now = Date.now();
    for (const [key, entry] of responseCache) {
        if (now - entry.timestamp > CACHE_TTL) {
            responseCache.delete(key);
        }
    }
}

// Clean cache periodically to prevent memory leaks
let lastCleanup = Date.now();

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { hostUrl, username, password, action, page, limit, ...otherParams } = body;

        if (!hostUrl || !username || !password) {
            return NextResponse.json(
                { error: 'Missing credentials' },
                { status: 400 }
            );
        }

        // Periodic cache cleanup (every 2 minutes)
        if (Date.now() - lastCleanup > 2 * 60 * 1000) {
            cleanExpiredCache();
            lastCleanup = Date.now();
        }

        const baseUrl = hostUrl.replace(/\/$/, '');

        // ---- PAGINATED MODE ----
        // When page & limit are provided, serve from server-side cache
        if (page !== undefined && limit !== undefined) {
            const cacheKey = getCacheKey(hostUrl, username, action);
            let cached = responseCache.get(cacheKey);

            // If no cache or expired, fetch from upstream first
            if (!cached || Date.now() - cached.timestamp > CACHE_TTL) {
                console.log(`[Proxy] Paginated: Fetching full data for ${action} (cache miss)`);

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
                    console.log(`[Proxy] Paginated: Cached ${data.length} items for ${action}`);
                } else {
                    // Non-array response, return directly
                    return NextResponse.json(data);
                }
            }

            // Serve the requested page
            const pageNum = Math.max(1, parseInt(page));
            const pageSize = Math.min(5000, Math.max(1, parseInt(limit)));
            const startIdx = (pageNum - 1) * pageSize;
            const endIdx = Math.min(startIdx + pageSize, cached.total);
            const pageData = cached.data.slice(startIdx, endIdx);

            const totalPages = Math.ceil(cached.total / pageSize);

            console.log(`[Proxy] Paginated: ${action} page ${pageNum}/${totalPages} (${pageData.length} items, total: ${cached.total})`);

            return NextResponse.json({
                items: pageData,
                page: pageNum,
                limit: pageSize,
                total: cached.total,
                totalPages,
                hasMore: pageNum < totalPages
            });
        }

        // ---- STANDARD MODE (non-paginated, for categories and small requests) ----
        const params = new URLSearchParams({
            username,
            password,
            action: action || '',
            ...otherParams
        });

        const apiUrl = `${baseUrl}/player_api.php?${params.toString()}`;

        console.log(`[Proxy] Action: ${action} | URL: ${apiUrl}`);
        if (Object.keys(otherParams).length > 0) {
            console.log(`[Proxy] Params:`, JSON.stringify(otherParams));
        }

        const response = await fetchWithRetry(apiUrl, action);

        if (!response.ok) {
            return NextResponse.json(
                { error: `Upstream error: ${response.statusText}`, details: response.status === 504 ? 'Gateway Timeout' : undefined },
                { status: response.status }
            );
        }

        const data = await parseResponse(response);
        const count = Array.isArray(data) ? data.length : 'object';
        console.log(`[Proxy] Data: ${count} items/type`);

        return NextResponse.json(data);

    } catch (error: any) {
        console.error('[Proxy] CRITICAL Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', details: error.message },
            { status: 500 }
        );
    }
}

/**
 * Fetch with retry logic
 */
async function fetchWithRetry(apiUrl: string, action: string, maxRetries: number = 3): Promise<Response> {
    let response: Response | undefined;
    let lastError: any;

    for (let i = 0; i <= maxRetries; i++) {
        try {
            response = await fetch(apiUrl);

            if (response.ok || response.status < 500) {
                break;
            }

            if (i < maxRetries) {
                console.warn(`[Proxy] Retry ${i + 1}/${maxRetries} for ${action} due to status ${response.status}`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            lastError = error;
            if (i < maxRetries) {
                console.warn(`[Proxy] Retry ${i + 1}/${maxRetries} for ${action} due to error:`, error);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    if (!response) {
        throw lastError || new Error('Fetch failed after retries');
    }

    console.log(`[Proxy] Response: ${response.status} ${response.statusText}`);
    return response;
}

/**
 * Parse response body (JSON or text)
 */
async function parseResponse(response: Response): Promise<any> {
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        return response.json();
    }

    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}
