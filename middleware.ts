import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supportsModernApp } from '@/app/lib/browserSupport';

const SKIP_PREFIXES = ['/api', '/legacy', '/debug', '/_next'];
const SKIP_EXACT = ['/legacy/app.js', '/favicon.ico'];

function shouldSkipMiddleware(pathname: string): boolean {
    if (SKIP_EXACT.includes(pathname)) return true;
    if (pathname.includes('.')) return true;
    return SKIP_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function middleware(request: NextRequest) {
    const { pathname, search } = request.nextUrl;

    if (shouldSkipMiddleware(pathname)) {
        return NextResponse.next();
    }

    const forceModern = request.nextUrl.searchParams.get('forceModern') === '1';
    const forceLegacy = request.nextUrl.searchParams.get('forceLegacy') === '1';

    if (forceModern || forceLegacy) {
        return NextResponse.next();
    }

    const userAgent = request.headers.get('user-agent');
    if (supportsModernApp(userAgent)) {
        return NextResponse.next();
    }

    const legacyUrl = request.nextUrl.clone();
    legacyUrl.pathname = '/legacy';
    legacyUrl.searchParams.set('redirect', `${pathname}${search}`);
    return NextResponse.redirect(legacyUrl);
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
