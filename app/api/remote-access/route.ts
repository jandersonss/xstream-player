import { NextResponse } from 'next/server';
import {
    createRemoteAccessSession,
    getCookieValue,
    getRemoteAccessState,
    getRequestHost,
    isRemoteAccessRequired,
    isValidRemoteAccessPin,
    PIN_RULE_MESSAGE,
    REMOTE_ACCESS_COOKIE_NAME,
    REMOTE_ACCESS_SESSION_SECONDS,
    verifyOrCreateRemoteAccessPin,
} from '@/app/lib/remoteAccess';

export const runtime = 'nodejs';

function isSecureRequest(request: Request) {
    return request.headers.get('x-forwarded-proto') === 'https' || request.url.startsWith('https://');
}

export async function GET(request: Request) {
    const state = await getRemoteAccessState(
        getRequestHost(request),
        getCookieValue(request.headers.get('cookie'), REMOTE_ACCESS_COOKIE_NAME)
    );

    return NextResponse.json(state);
}

export async function POST(request: Request) {
    if (!isRemoteAccessRequired(getRequestHost(request))) {
        return NextResponse.json({ success: true, bypass: true });
    }

    const body = await request.json().catch(() => ({}));
    const { pin } = body;

    if (!isValidRemoteAccessPin(pin)) {
        return NextResponse.json({ error: PIN_RULE_MESSAGE }, { status: 400 });
    }

    const pinHash = await verifyOrCreateRemoteAccessPin(pin);

    if (!pinHash) {
        return NextResponse.json({ error: 'PIN inválido' }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });

    response.cookies.set({
        name: REMOTE_ACCESS_COOKIE_NAME,
        value: createRemoteAccessSession(pinHash),
        httpOnly: true,
        sameSite: 'lax',
        secure: isSecureRequest(request),
        path: '/',
        maxAge: REMOTE_ACCESS_SESSION_SECONDS,
    });

    return response;
}
