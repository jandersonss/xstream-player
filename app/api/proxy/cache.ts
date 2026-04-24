export const responseCache = new Map<string, { data: any[]; timestamp: number; total: number }>();
export const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function getCacheKey(hostUrl: string, username: string, action: string): string {
    return `${hostUrl}:${username}:${action}`;
}

export function cleanExpiredCache() {
    const now = Date.now();
    for (const [key, entry] of responseCache) {
        if (now - entry.timestamp > CACHE_TTL) {
            responseCache.delete(key);
        }
    }
}

let lastCleanup = Date.now();

export function performPeriodicCleanup() {
    if (Date.now() - lastCleanup > 2 * 60 * 1000) {
        cleanExpiredCache();
        lastCleanup = Date.now();
    }
}

/**
 * Fetch with retry logic
 */
export async function fetchWithRetry(apiUrl: string, action: string, maxRetries: number = 3): Promise<Response> {
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
export async function parseResponse(response: Response): Promise<any> {
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
