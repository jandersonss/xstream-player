export function supportsModernApp(): boolean {
    try {
        var ua = String(navigator.userAgent || '').toLowerCase();
        var isWebOs = ua.indexOf('webos') !== -1 || ua.indexOf('web0s') !== -1;
        var chromeMatch = ua.match(/chrome\/(\d+)/);
        var chromeVersion = chromeMatch ? parseInt(chromeMatch[1], 10) : 0;

        if (isWebOs && (!chromeVersion || chromeVersion < 72)) {
            return false;
        }

        if (typeof Promise === 'undefined' || typeof fetch === 'undefined') {
            return false;
        }

        return true;
    } catch (e) {
        return false;
    }
}

export function redirectToModernIfSupported(): void {
    try {
        var search = window.location.search || '';
        if (search.indexOf('forceLegacy=1') !== -1) return;

        if (!supportsModernApp()) return;

        var params = new URLSearchParams(search);
        var redirectPath = params.get('redirect') || '/dashboard';
        params.delete('redirect');
        params.set('forceModern', '1');
        var query = params.toString();
        var target = redirectPath + (query ? '?' + query : '?forceModern=1');
        window.location.replace(target);
    } catch (e) {
        /* ignore */
    }
}
