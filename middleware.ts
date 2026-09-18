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

  return NextResponse.next();
}

export const config = {
  // `/api` is matched now (it was excluded before) so the CORS block above can run on it.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
