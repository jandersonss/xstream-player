import { NextResponse } from 'next/server';
import {
    createRemoteAccessSession,
    enforceRemoteAccessForApi,
    getCookieValue,
    getRemoteAccessPinHash,
    getRequestHost,
    REMOTE_ACCESS_COOKIE_NAME,
    REMOTE_ACCESS_SESSION_SECONDS
} from '@/app/lib/remoteAccess';
import { authenticateToken, revokeDevice } from '@/app/lib/deviceStore';
import { PROFILE_COOKIE_NAME } from '@/app/lib/userStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Same lifetime the web app uses for the profile cookie (ProfileContext). */
const PROFILE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Marks the browser session as belonging to a paired TV, and which one.
 *
 * Once the bootstrap hands over here the app runs same-origin and drops the
 * Bearer token — nothing else records that this tab is a TV. This cookie lets
 * `/dashboard/devices` show a "disconnect this TV" action and lets `DELETE` know
 * which device to revoke. httpOnly: the client only needs to be *told* it is a
 * device (via `/api/devices`), never to read the id.
 */
const DEVICE_SESSION_COOKIE_NAME = 'xstream_device';
const DEVICE_SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function isSecureRequest(request: Request) {
    return request.headers.get('x-forwarded-proto') === 'https' || request.url.startsWith('https://');
}

/**
 * Trades a device token for a browser session on the server origin.
 *
 * The packaged TV app is a thin bootstrap: it pairs, then navigates the TV straight here,
 * and from this redirect on the real app runs same-origin like any browser. That is why the
 * token arrives as a query param and the answers are redirects, not JSON — the caller is a
 * navigating TV, not a fetch.
 *
 * The token is in the URL, so this handler never logs the URL and answers `no-store`.
 */
export async function GET(request: Request) {
    const requestUrl = new URL(request.url);
    const token = requestUrl.searchParams.get('token');

    try {
        const device = token ? authenticateToken(token) : null;

        if (!device) {
            return redirectTo(request, '/?deviceAuth=invalid');
        }

        const response = redirectTo(request, '/dashboard');

        // The remote-access session is signed with the PIN hash: with no PIN configured
        // there is nothing to sign, and the gate is not active either, so skip it.
        // The session lasts REMOTE_ACCESS_SESSION_SECONDS (3h); the TV renews it by
        // coming back through this route whenever a request answers 401.
        const pinHash = await getRemoteAccessPinHash();

        if (pinHash) {
            response.cookies.set({
                name: REMOTE_ACCESS_COOKIE_NAME,
                value: createRemoteAccessSession(pinHash),
                httpOnly: true,
                sameSite: 'lax',
                secure: isSecureRequest(request),
                path: '/',
                maxAge: REMOTE_ACCESS_SESSION_SECONDS
            });
        }

        if (device.profileId) {
            // Not httpOnly on purpose: ProfileContext reads and rewrites this cookie
            // from the client, and making it httpOnly would break profile switching.
            response.cookies.set({
                name: PROFILE_COOKIE_NAME,
                value: device.profileId,
                httpOnly: false,
                sameSite: 'lax',
                secure: isSecureRequest(request),
                path: '/',
                maxAge: PROFILE_COOKIE_MAX_AGE
            });
        }

        response.cookies.set({
            name: DEVICE_SESSION_COOKIE_NAME,
            value: device.id,
            httpOnly: true,
            sameSite: 'lax',
            secure: isSecureRequest(request),
            path: '/',
            maxAge: DEVICE_SESSION_COOKIE_MAX_AGE
        });

        return response;
    } catch (error) {
        // Never include the request URL here: it carries the device token.
        console.error('[Devices] Failed to open device session', error);
        return redirectTo(request, '/?deviceAuth=invalid');
    }
}

/**
 * "Disconnect this TV." Called from `/dashboard/devices` when the tab is a device
 * session. Revokes the device so the packaged bootstrap's next launch fails its
 * token check and returns to the setup screen (where the server can be changed),
 * and clears the session cookies on the way out.
 */
export async function DELETE(request: Request) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    const deviceId = getCookieValue(request.headers.get('cookie'), DEVICE_SESSION_COOKIE_NAME);

    if (!deviceId) {
        return NextResponse.json({ error: 'Esta sessão não é de um aparelho de TV.' }, { status: 400 });
    }

    try {
        revokeDevice(deviceId);

        const response = NextResponse.json({ success: true });
        for (const name of [DEVICE_SESSION_COOKIE_NAME, REMOTE_ACCESS_COOKIE_NAME, PROFILE_COOKIE_NAME]) {
            response.cookies.set({ name, value: '', path: '/', maxAge: 0 });
        }
        response.headers.set('Cache-Control', 'no-store');
        return response;
    } catch (error) {
        console.error('[Devices] Failed to disconnect device session', error);
        return NextResponse.json({ error: 'Falha ao desconectar o aparelho.' }, { status: 500 });
    }
}

/**
 * Redirects to `target` on the host the caller actually used.
 *
 * `request.url` is the server's own view of the request and reports `localhost`,
 * which is worthless here: the caller is a TV on the network, and sending it to
 * `localhost` sends it to itself, where nothing is listening. The Host header is
 * the only thing that names the server as the TV can reach it.
 */
function redirectTo(request: Request, target: string) {
    const host = getRequestHost(request);
    const proto = request.headers.get('x-forwarded-proto') || (request.url.startsWith('https://') ? 'https' : 'http');
    const base = host ? `${proto}://${host}` : request.url;

    const response = NextResponse.redirect(new URL(target, base), 302);
    response.headers.set('Cache-Control', 'no-store');
    return response;
}
