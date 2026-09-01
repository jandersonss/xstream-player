import 'server-only';

import { NextResponse } from 'next/server';
import { authenticateToken, type Device } from './deviceStore';
import { enforceRemoteAccessForApi } from './remoteAccess';

/**
 * Unified API guard. The web app authenticates by cookie (remote access PIN, or nothing
 * at all on the LAN); the packaged TV client cannot — cookies do not survive its
 * `file://` origin — so it carries a device Bearer token instead.
 *
 * A Bearer token only ever grants what a paired device may do. Owner-only routes
 * (approving another device, for instance) must keep using `enforceRemoteAccessForApi`,
 * so a paired TV can never enroll a second one.
 */

/** Reads a `Authorization: Bearer <token>` header, if present and well formed. */
function readBearerToken(request: Request): string | null {
    const header = request.headers.get('authorization');

    if (!header) {
        return null;
    }

    const [scheme, ...rest] = header.trim().split(/\s+/);

    if (scheme.toLowerCase() !== 'bearer' || rest.length !== 1 || !rest[0]) {
        return null;
    }

    return rest[0];
}

/**
 * The device behind this request, or null when it is not a device request.
 * Validating also refreshes the device's `last_seen_at`.
 */
export function getRequestDevice(request: Request): Device | null {
    const token = readBearerToken(request);

    if (!token) {
        return null;
    }

    try {
        return authenticateToken(token);
    } catch (error) {
        // Never log the token itself.
        console.error('[ApiAuth] Failed to validate device token', error);
        return null;
    }
}

/** Default profile of the authenticated device, when it has one pinned. */
export function getRequestDeviceProfileId(request: Request): string | null {
    return getRequestDevice(request)?.profileId ?? null;
}

/**
 * Guard for API routes: a valid device token authorizes the request; anything else falls
 * back to the existing remote-access rules. Returns a response to send back when the
 * request must be refused, or null when it may proceed.
 */
export async function enforceApiAccess(request: Request): Promise<NextResponse | null> {
    const token = readBearerToken(request);

    if (token) {
        const device = getRequestDevice(request);

        if (device) {
            return null;
        }

        return NextResponse.json({ error: 'Dispositivo não autorizado' }, { status: 401 });
    }

    return enforceRemoteAccessForApi(request);
}
