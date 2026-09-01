/**
 * CORS for the API surface.
 *
 * The TV client is packaged and runs from a foreign origin — `file://` on webOS, which
 * the browser sends as the literal string `null` — so every API response has to echo the
 * request Origin back, and preflights have to be answered.
 *
 * No `Access-Control-Allow-Credentials`: the TV never authenticates with cookies (they do
 * not survive a `file://` origin), it uses a device Bearer token. Leaving credentials off
 * keeps the wildcard-ish echo from turning into a cross-site request forgery vector — a
 * hostile page can call the API without a token, and gets a 401 like anyone else.
 *
 * Deliberately free of Node-only imports (and of `server-only`): `middleware.ts` runs on
 * the Edge runtime and consumes these helpers.
 */

const ALLOWED_HEADERS = 'Content-Type, Authorization, X-Xstream-Profile';
const ALLOWED_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
const MAX_AGE_SECONDS = '86400';

/** Adds the CORS headers to a response, echoing the request Origin (including `null`). */
export function withCors<T extends Response>(response: T, request: Request): T {
    const origin = request.headers.get('origin');

    if (!origin) {
        return response;
    }

    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
    response.headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
    response.headers.set('Access-Control-Max-Age', MAX_AGE_SECONDS);
    // Caches must not serve one origin's response to another.
    response.headers.append('Vary', 'Origin');

    return response;
}

/** Answers a CORS preflight. Usable directly as an `OPTIONS` route handler. */
export function corsPreflight(request: Request): Response {
    return withCors(new Response(null, { status: 204 }), request);
}
