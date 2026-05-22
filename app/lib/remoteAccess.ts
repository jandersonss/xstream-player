import crypto from 'crypto';
import fs from 'fs/promises';
import net from 'net';
import path from 'path';
import { NextResponse } from 'next/server';

const CONFIG_DIR = path.join(process.cwd(), 'data');
const CONFIG_PATH = path.join(CONFIG_DIR, 'remote-access.json');

const HASH_ALGORITHM = 'scrypt';
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

export const REMOTE_ACCESS_COOKIE_NAME = 'xstream_remote_access';
export const REMOTE_ACCESS_SESSION_SECONDS = 3 * 60 * 60;
export const PIN_RULE_MESSAGE = 'Use 4 a 64 caracteres, com letras e números, sem símbolos.';

interface RemoteAccessConfig {
    pinHash?: string;
}

export interface RemoteAccessState {
    required: boolean;
    configured: boolean;
    authorized: boolean;
}

const PIN_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{4,64}$/;

export function isValidRemoteAccessPin(pin: unknown): pin is string {
    return typeof pin === 'string' && PIN_PATTERN.test(pin);
}

async function readRemoteAccessConfig(): Promise<RemoteAccessConfig> {
    try {
        const data = await fs.readFile(CONFIG_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            return {};
        }
        throw error;
    }
}

async function writeRemoteAccessConfig(config: RemoteAccessConfig) {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export async function getRemoteAccessConfigStatus() {
    const config = await readRemoteAccessConfig();
    return { configured: Boolean(config.pinHash) };
}

export async function setupRemoteAccessPin(pin: string) {
    const pinHash = hashPin(pin);
    await writeRemoteAccessConfig({ pinHash });
    return pinHash;
}

export async function verifyOrCreateRemoteAccessPin(pin: string) {
    const config = await readRemoteAccessConfig();

    if (!config.pinHash) {
        return setupRemoteAccessPin(pin);
    }

    if (!verifyPin(pin, config.pinHash)) {
        return null;
    }

    return config.pinHash;
}

function hashPin(pin: string) {
    const salt = crypto.randomBytes(16).toString('base64url');
    const key = crypto
        .scryptSync(pin, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
        .toString('base64url');

    return [HASH_ALGORITHM, SCRYPT_N, SCRYPT_R, SCRYPT_P, salt, key].join('$');
}

function verifyPin(pin: string, storedHash: string) {
    const [algorithm, n, r, p, salt, storedKey] = storedHash.split('$');

    if (algorithm !== HASH_ALGORITHM || !n || !r || !p || !salt || !storedKey) {
        return false;
    }

    const nValue = Number(n);
    const rValue = Number(r);
    const pValue = Number(p);

    if (!Number.isFinite(nValue) || !Number.isFinite(rValue) || !Number.isFinite(pValue)) {
        return false;
    }

    try {
        const derivedKey = crypto.scryptSync(pin, salt, KEY_LENGTH, {
            N: nValue,
            r: rValue,
            p: pValue,
        });
        const storedKeyBuffer = Buffer.from(storedKey, 'base64url');

        return storedKeyBuffer.length === derivedKey.length && crypto.timingSafeEqual(storedKeyBuffer, derivedKey);
    } catch {
        return false;
    }
}

export function createRemoteAccessSession(pinHash: string) {
    const expiresAt = Date.now() + REMOTE_ACCESS_SESSION_SECONDS * 1000;
    const nonce = crypto.randomBytes(16).toString('base64url');
    const payload = `${expiresAt}.${nonce}`;
    const signature = signSessionPayload(payload, pinHash);

    return `${payload}.${signature}`;
}

function verifyRemoteAccessSession(cookieValue: string | undefined, pinHash: string) {
    if (!cookieValue) {
        return false;
    }

    const [expiresAtValue, nonce, signature] = cookieValue.split('.');
    const expiresAt = Number(expiresAtValue);

    if (!expiresAtValue || !nonce || !signature || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        return false;
    }

    const expectedSignature = signSessionPayload(`${expiresAtValue}.${nonce}`, pinHash);
    const expectedBuffer = Buffer.from(expectedSignature);
    const receivedBuffer = Buffer.from(signature);

    return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function signSessionPayload(payload: string, pinHash: string) {
    return crypto.createHmac('sha256', pinHash).update(payload).digest('base64url');
}

export function isRemoteAccessRequired(hostHeader: string | null) {
    const hostname = extractHostname(hostHeader);

    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || net.isIP(hostname)) {
        return false;
    }

    if (!hostname.includes('.')) {
        return false;
    }

    return hostname.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
}

function extractHostname(hostHeader: string | null) {
    const host = hostHeader?.split(',')[0]?.trim().toLowerCase();

    if (!host) {
        return '';
    }

    if (host.startsWith('[')) {
        const closingBracket = host.indexOf(']');
        return closingBracket > 0 ? host.slice(1, closingBracket) : host;
    }

    const withoutTrailingDot = host.replace(/\.$/, '');

    if (withoutTrailingDot.indexOf(':') !== withoutTrailingDot.lastIndexOf(':')) {
        return withoutTrailingDot;
    }

    return withoutTrailingDot.split(':')[0];
}

export function getRequestHost(request: Request) {
    return request.headers.get('x-forwarded-host') || request.headers.get('host');
}

export function getCookieValue(cookieHeader: string | null, name: string) {
    if (!cookieHeader) {
        return undefined;
    }

    const cookie = cookieHeader
        .split(';')
        .map(part => part.trim())
        .find(part => part.startsWith(`${name}=`));

    return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : undefined;
}

export async function getRemoteAccessState(hostHeader: string | null, cookieValue?: string): Promise<RemoteAccessState> {
    if (!isRemoteAccessRequired(hostHeader)) {
        return { required: false, configured: false, authorized: true };
    }

    const config = await readRemoteAccessConfig();
    const configured = Boolean(config.pinHash);
    const authorized = configured && verifyRemoteAccessSession(cookieValue, config.pinHash as string);

    return { required: true, configured, authorized };
}

export async function enforceRemoteAccessForApi(request: Request) {
    const state = await getRemoteAccessState(
        getRequestHost(request),
        getCookieValue(request.headers.get('cookie'), REMOTE_ACCESS_COOKIE_NAME)
    );

    if (!state.required || state.authorized) {
        return null;
    }

    return NextResponse.json(
        { error: state.configured ? 'PIN de acesso remoto obrigatório' : 'PIN de acesso remoto não configurado' },
        { status: 401 }
    );
}
