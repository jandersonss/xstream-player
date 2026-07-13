'use client';

const DEVICE_ID_KEY = 'xstream_device_id';
const DEVICE_NAME_KEY = 'xstream_device_name';
const AUTO_BROADCAST_KEY = 'xstream_auto_broadcast';

function randomId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Stable device identity, created on first run and persisted in localStorage. */
export function getDeviceId(): string {
    if (typeof window === 'undefined') return '';
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
        id = randomId();
        localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
}

/** Friendly label derived from the userAgent (e.g. "Smart TV (LG)", "iPhone", "PC (Windows)"). */
function detectDeviceLabel(): string {
    if (typeof navigator === 'undefined') return 'Aparelho';
    const ua = navigator.userAgent.toLowerCase();

    if (/webos|web0s|netcast/.test(ua)) return 'Smart TV (LG)';
    if (/tizen/.test(ua)) return 'Smart TV (Samsung)';
    if (/smart-?tv|hbbtv|viera|aquos|bravia|roku/.test(ua)) return 'Smart TV';
    if (/ipad/.test(ua)) return 'iPad';
    if (/iphone|ipod/.test(ua)) return 'iPhone';
    if (/android/.test(ua)) return 'Android';
    if (/windows/.test(ua)) return 'PC (Windows)';
    if (/macintosh|mac os/.test(ua)) return 'Mac';
    if (/linux/.test(ua)) return 'PC (Linux)';
    return 'Aparelho';
}

/** Device name (editable). Falls back to the userAgent-derived label if unset. */
export function getDeviceName(): string {
    if (typeof window === 'undefined') return '';
    const name = localStorage.getItem(DEVICE_NAME_KEY);
    if (name) return name;
    return detectDeviceLabel();
}

export function setDeviceName(name: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(DEVICE_NAME_KEY, name.trim());
}

/**
 * Per-device "broadcast everything" preference: when on, any content starts
 * playing through the relay/TV Mode without clicking "Transmitir" each time.
 */
export function getAutoBroadcast(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(AUTO_BROADCAST_KEY) === '1';
}

export function setAutoBroadcast(on: boolean): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(AUTO_BROADCAST_KEY, on ? '1' : '0');
}

function isPrivateIpv4(ip: string): boolean {
    if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
    const m = /^172\.(\d+)\./.exec(ip);
    return m ? Number(m[1]) >= 16 && Number(m[1]) <= 31 : false;
}

/**
 * Tries to discover the device's LAN IP via WebRTC (best-effort).
 * Works on old Chromium (WebOS TVs < 74); on modern browsers the candidate
 * comes obfuscated as mDNS (.local), so we return null.
 */
export function detectLocalIp(timeoutMs = 1500): Promise<string | null> {
    if (typeof window === 'undefined' || typeof RTCPeerConnection === 'undefined') {
        return Promise.resolve(null);
    }

    return new Promise((resolve) => {
        let pc: RTCPeerConnection;
        try {
            pc = new RTCPeerConnection({ iceServers: [] });
        } catch {
            resolve(null);
            return;
        }

        let settled = false;
        const finish = (value: string | null) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try { pc.close(); } catch { /* ignore */ }
            resolve(value);
        };

        const timer = setTimeout(() => finish(null), timeoutMs);

        pc.onicecandidate = (event) => {
            if (!event.candidate) return;
            const match = /(\d{1,3}(?:\.\d{1,3}){3})/.exec(event.candidate.candidate);
            if (match && isPrivateIpv4(match[1])) {
                finish(match[1]);
            }
        };

        try {
            pc.createDataChannel('probe');
            pc.createOffer()
                .then((offer) => pc.setLocalDescription(offer))
                .catch(() => finish(null));
        } catch {
            finish(null);
        }
    });
}
