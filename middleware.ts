import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { corsPreflight, withCors } from '@/app/lib/cors';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // CORS for the whole API surface, in one place: the packaged TV client calls it from a
  // foreign origin (`file://` => `Origin: null`). Doing it here instead of route by route
  // keeps every response consistent — including the streaming ones the relay serves to a
  // <video> tag — and means a new route cannot forget it.
  if (pathname.startsWith('/api')) {
    if (request.method === 'OPTIONS') {
      return corsPreflight(request);
    }

    return withCors(NextResponse.next(), request);
  }

  // Avoid redirect loops and skip static file requests
  if (
    pathname.startsWith('/legacy') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/debug') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Allow forcing the modern app when the URL has the forceModern=1 param
  if (request.nextUrl.searchParams.has('forceModern')) {
    return NextResponse.next();
  }

  const userAgent = request.headers.get('user-agent') || '';
  const ua = userAgent.toLowerCase();

  const isWebOs = ua.includes('webos') || ua.includes('web0s');
  const chromeMatch = ua.match(/chrome\/(\d+)/);
  const chromeVersion = chromeMatch ? parseInt(chromeMatch[1], 10) : 0;

  // Floor for the modern app, and the reason for it.
  //
  // The client bundle is downleveled to whatever `browserslist` in package.json
  // says, so the JavaScript floor is a build setting rather than a fact about the
  // app. What is *not* negotiable is the CSS: the layout is written to avoid the
  // features these engines lack. webOS 4's packaged container reports Chromium 53
  // (its browser app is a different, newer engine — do not use it to judge what
  // the packaged app can do). Below this, the legacy app is still the right one.
  const MODERN_APP_MIN_CHROME = 53;

  if (isWebOs && (!chromeVersion || chromeVersion < MODERN_APP_MIN_CHROME)) {
    const url = request.nextUrl.clone();
    url.pathname = '/legacy/index.html';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // `/api` is matched now (it was excluded before) so the CORS block above can run on it.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
