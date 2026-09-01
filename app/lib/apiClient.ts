'use client';

/**
 * Single place that knows where the server is and how to authenticate against it.
 *
 * On the web build the base URL is empty, so every request stays same-origin and
 * behaves exactly like a plain `fetch('/api/...')` (cookies included). On the
 * packaged TV client the app runs from a different origin (`file://`), where
 * relative URLs and cookies do not work: the base URL points at the server and
 * authentication travels in an `Authorization: Bearer` header.
 */

const SERVER_URL_KEY = 'xstream_server_url';
const DEVICE_TOKEN_KEY = 'xstream_device_token';
/** Mirrors the `xstream_profile` cookie for origins where cookies are unavailable. */
const PROFILE_KEY = 'xstream_profile';

export const UNAUTHORIZED_EVENT = 'xstream:unauthorized';

function readStored(key: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeStored(key: string, value: string | null): void {
    if (typeof window === 'undefined') return;
    try {
        if (value === null || value === '') {
            window.localStorage.removeItem(key);
        } else {
            window.localStorage.setItem(key, value);
        }
    } catch {
        /* storage unavailable (private mode, packaged app quirks) — ignore */
    }
}

/**
 * True when the page was loaded from a server that can answer `/api/...` itself.
 * A packaged TV client is loaded from `file://` (origin `null`), where it cannot.
 */
function isServedOverHttp(): boolean {
    if (typeof window === 'undefined') return false;
    const protocol = window.location.protocol;
    return protocol === 'http:' || protocol === 'https:';
}

/** Base URL of the server. '' on the web app (same-origin), 'http://192.168.0.10:3000' on TV. */
export function getServerBaseUrl(): string {
    // A stored base URL is only ever right for a packaged client. When the page is
    // already being served over http(s), the origin it came from is the server by
    // definition, and honouring a stale stored value would send every request to
    // whatever host/port was configured on some earlier run.
    if (isServedOverHttp()) return '';

    const stored = readStored(SERVER_URL_KEY);
    if (!stored) return '';
    return stored.replace(/\/+$/, '');
}

export function setServerBaseUrl(url: string): void {
    writeStored(SERVER_URL_KEY, url ? url.trim().replace(/\/+$/, '') : null);
}

/** Device token obtained during pairing. Null on the web app. */
export function getDeviceToken(): string | null {
    return readStored(DEVICE_TOKEN_KEY);
}

export function setDeviceToken(token: string | null): void {
    writeStored(DEVICE_TOKEN_KEY, token);
}

/** Active profile id, from the cookie on the web and from localStorage on TV. */
function getActiveProfileId(): string | null {
    if (typeof document !== 'undefined' && document.cookie) {
        const match = document.cookie.match(new RegExp(`(?:^|; )${PROFILE_KEY}=([^;]*)`));
        if (match) return decodeURIComponent(match[1]);
    }
    return readStored(PROFILE_KEY);
}

/** Absolute URL for an API path — for `src` attributes that never go through fetch. */
export function apiUrl(path: string): string {
    const base = getServerBaseUrl();
    if (!base) return path;
    return path.charAt(0) === '/' ? `${base}${path}` : `${base}/${path}`;
}

/**
 * Normalizes any `HeadersInit` into a plain object.
 *
 * Deliberately avoids the `Headers` constructor: on the Chromium that webOS 4
 * ships (53), `new Headers(undefined)` throws "Failed to construct 'Headers':
 * No matching constructor signature" — the old WebIDL binding rejects an
 * explicitly-passed `undefined` instead of treating it as an absent argument.
 * Since every request in the app goes through `apiFetch`, that one throw left
 * the whole UI without data on those TVs. A plain object is a valid `HeadersInit`
 * everywhere and sidesteps the constructor entirely.
 */
function toHeaderRecord(source: HeadersInit | undefined): Record<string, string> {
    const result: Record<string, string> = {};

    if (!source) return result;

    if (typeof Headers !== 'undefined' && source instanceof Headers) {
        source.forEach((value, key) => { result[key] = value; });
    } else if (Array.isArray(source)) {
        source.forEach(([key, value]) => { result[key] = value; });
    } else {
        const record = source as Record<string, string>;
        Object.keys(record).forEach((key) => { result[key] = record[key]; });
    }

    return result;
}

/** Case-insensitive lookup: header names are not case sensitive. */
function hasHeader(headers: Record<string, string>, name: string): boolean {
    const wanted = name.toLowerCase();
    return Object.keys(headers).some((key) => key.toLowerCase() === wanted);
}

/**
 * Replacement for every `fetch('/api/...')` in client code. Injects the base URL,
 * the device Bearer token and the active profile header.
 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
    const base = getServerBaseUrl();
    const token = getDeviceToken();
    const headers = toHeaderRecord(init?.headers);

    if (token && !hasHeader(headers, 'Authorization')) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const profileId = getActiveProfileId();
    if (profileId && !hasHeader(headers, 'X-Xstream-Profile')) {
        headers['X-Xstream-Profile'] = profileId;
    }

    const request: RequestInit = { ...init, headers };
    // Cross-origin requests from the TV client must not try to send cookies:
    // the server answers CORS without Allow-Credentials.
    if (base && !request.credentials) {
        request.credentials = 'omit';
    }

    return fetch(apiUrl(path), request).then((response) => {
        // Only a device token can be invalidated server-side; the web app's 401s
        // come from the remote-access gate and must keep their current handling.
        if (response.status === 401 && token) {
            setDeviceToken(null);
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
            }
        }
        return response;
    });
}
