'use client';

const DEVICE_ID_KEY = 'xstream_device_id';
const DEVICE_NAME_KEY = 'xstream_device_name';

function randomId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Identidade estável do aparelho, criada na primeira vez e persistida no localStorage. */
export function getDeviceId(): string {
    if (typeof window === 'undefined') return '';
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
        id = randomId();
        localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
}

/** Rótulo amigável derivado do userAgent (ex.: "Smart TV (LG)", "iPhone", "PC (Windows)"). */
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

/** Nome do aparelho (editável). Se o usuário não definiu, deriva do userAgent. */
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

function isPrivateIpv4(ip: string): boolean {
    if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
    const m = /^172\.(\d+)\./.exec(ip);
    return m ? Number(m[1]) >= 16 && Number(m[1]) <= 31 : false;
}

/**
 * Tenta descobrir o IP de LAN do aparelho via WebRTC (best-effort).
 * Funciona em Chromium antigo (TVs WebOS < 74); em navegadores modernos o
 * candidato vem ofuscado como mDNS (.local) e retornamos null.
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
