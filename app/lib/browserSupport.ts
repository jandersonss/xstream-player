export function supportsModernApp(userAgent: string | null | undefined): boolean {
    const ua = String(userAgent || '').toLowerCase();

    if (!ua) return false;

    const isWebOs = ua.indexOf('webos') !== -1 || ua.indexOf('web0s') !== -1;
    const chromeMatch = ua.match(/chrome\/(\d+)/);
    const chromeVersion = chromeMatch ? parseInt(chromeMatch[1], 10) : 0;

    if (isWebOs && (!chromeVersion || chromeVersion < 72)) {
        return false;
    }

    const isTizen = ua.indexOf('tizen') !== -1;
    if (isTizen && chromeVersion && chromeVersion < 72) {
        return false;
    }

    if (ua.indexOf('msie') !== -1 || ua.indexOf('trident/') !== -1) {
        return false;
    }

    return true;
}

export function buildModernRedirectUrl(path: string, search: string): string {
    const targetPath = path && path !== '/legacy' ? path : '/dashboard';
    const params = new URLSearchParams(search.replace(/^\?/, ''));
    params.delete('redirect');
    params.set('forceModern', '1');
    const query = params.toString();
    return query ? `${targetPath}?${query}` : `${targetPath}?forceModern=1`;
}
