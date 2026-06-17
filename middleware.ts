import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Evita loops de redirecionamento e ignora requisições de arquivos estáticos ou APIs
  if (
    pathname.startsWith('/legacy') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/debug') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Permite forçar o app moderno se a URL tiver o parâmetro forceModern=1
  if (request.nextUrl.searchParams.has('forceModern')) {
    return NextResponse.next();
  }

  const userAgent = request.headers.get('user-agent') || '';
  const ua = userAgent.toLowerCase();

  const isWebOs = ua.includes('webos') || ua.includes('web0s');
  const chromeMatch = ua.match(/chrome\/(\d+)/);
  const chromeVersion = chromeMatch ? parseInt(chromeMatch[1], 10) : 0;

  // Redireciona WebOS antigo (Chrome < 72) para a versão legacy
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
