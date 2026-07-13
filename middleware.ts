import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Avoid redirect loops and skip static file / API requests
  if (
    pathname.startsWith('/legacy') ||
    pathname.startsWith('/api') ||
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

  // Redirect old WebOS (Chrome < 72) to the legacy version
  if (isWebOs && (!chromeVersion || chromeVersion < 72)) {
    const url = request.nextUrl.clone();
    url.pathname = '/legacy/index.html';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
