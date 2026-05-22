'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type CheckStatus = 'ok' | 'warn' | 'fail';

interface DebugCheck {
    name: string;
    status: CheckStatus;
    detail: string;
}

interface BrowserInfo {
    userAgent: string;
    platform: string;
    language: string;
    online: string;
    cookies: string;
    screen: string;
    viewport: string;
    deviceMemory: string;
    cpuCores: string;
    chromeVersion: string;
}

const statusStyle: Record<CheckStatus, string> = {
    ok: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    warn: 'bg-yellow-500/15 text-yellow-200 border-yellow-500/30',
    fail: 'bg-red-500/15 text-red-300 border-red-500/30',
};

const statusLabel: Record<CheckStatus, string> = {
    ok: 'OK',
    warn: 'ATENCAO',
    fail: 'FALHA',
};

function supported(condition: boolean, failDetail: string): DebugCheck['status'] {
    return condition ? 'ok' : failDetail ? 'fail' : 'warn';
}

function canUseLocalStorage() {
    try {
        const key = '__xstream_debug__';
        window.localStorage.setItem(key, '1');
        window.localStorage.removeItem(key);
        return true;
    } catch {
        return false;
    }
}

function getChromeVersion(userAgent: string) {
    const match = userAgent.match(/(?:chrome|chromium)\/(\d+)/i);
    return match ? match[1] : 'nao identificado';
}

function getBrowserInfo(): BrowserInfo {
    const nav = navigator as Navigator & {
        deviceMemory?: number;
        hardwareConcurrency?: number;
    };

    return {
        userAgent: navigator.userAgent,
        platform: navigator.platform || 'nao informado',
        language: navigator.language || 'nao informado',
        online: navigator.onLine ? 'sim' : 'nao',
        cookies: navigator.cookieEnabled ? 'sim' : 'nao',
        screen: `${window.screen.width}x${window.screen.height}`,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        deviceMemory: nav.deviceMemory ? `${nav.deviceMemory} GB` : 'indisponivel',
        cpuCores: nav.hardwareConcurrency ? String(nav.hardwareConcurrency) : 'indisponivel',
        chromeVersion: getChromeVersion(navigator.userAgent),
    };
}

function buildChecks(): DebugCheck[] {
    const video = document.createElement('video');
    const nativeHls =
        video.canPlayType('application/vnd.apple.mpegurl') !== '' ||
        video.canPlayType('application/x-mpegURL') !== '';
    const mp4H264 = video.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"') !== '';
    const mediaSource = 'MediaSource' in window;
    const sourceBuffer = 'SourceBuffer' in window;
    const blobUrl = 'Blob' in window && 'URL' in window && typeof URL.createObjectURL === 'function';
    const hlsPlayback = nativeHls || mediaSource;
    const localStorageOk = canUseLocalStorage();

    return [
        {
            name: 'JavaScript moderno',
            status: supported(typeof Promise !== 'undefined' && typeof Object.assign === 'function', 'Promise/Object.assign ausente'),
            detail: typeof Promise !== 'undefined' ? 'Promise disponivel' : 'Promise ausente',
        },
        {
            name: 'Promise.finally',
            status: typeof Promise !== 'undefined' && typeof Promise.prototype.finally === 'function' ? 'ok' : 'warn',
            detail: typeof Promise !== 'undefined' && typeof Promise.prototype.finally === 'function'
                ? 'Nativo ou polyfill ativo'
                : 'Polyfill pode ser necessario',
        },
        {
            name: 'Requisicoes HTTP',
            status: typeof fetch === 'function' || typeof XMLHttpRequest !== 'undefined' ? 'ok' : 'fail',
            detail: typeof fetch === 'function' ? 'fetch disponivel' : typeof XMLHttpRequest !== 'undefined' ? 'XHR disponivel' : 'fetch/XHR ausentes',
        },
        {
            name: 'Sincronizacao de lista',
            status: typeof XMLHttpRequest !== 'undefined' ? 'ok' : 'fail',
            detail: typeof XMLHttpRequest !== 'undefined' ? 'XHR suportado para NDJSON' : 'XHR ausente',
        },
        {
            name: 'Banco local',
            status: 'indexedDB' in window ? 'ok' : 'fail',
            detail: 'indexedDB' in window ? 'IndexedDB disponivel' : 'IndexedDB ausente',
        },
        {
            name: 'Sessao local',
            status: localStorageOk ? 'ok' : 'fail',
            detail: localStorageOk ? 'localStorage gravavel' : 'localStorage bloqueado',
        },
        {
            name: 'Cookies',
            status: navigator.cookieEnabled ? 'ok' : 'warn',
            detail: navigator.cookieEnabled ? 'Cookies habilitados' : 'Cookies desabilitados',
        },
        {
            name: 'Blob/Object URL',
            status: blobUrl ? 'ok' : 'warn',
            detail: blobUrl ? 'Necessario para legendas salvo' : 'Legendas locais podem falhar',
        },
        {
            name: 'AbortController',
            status: typeof AbortController !== 'undefined' ? 'ok' : 'warn',
            detail: typeof AbortController !== 'undefined' ? 'Cancelamento de requests disponivel' : 'Usando fallback/polyfill',
        },
        {
            name: 'Elemento de video',
            status: video && typeof video.canPlayType === 'function' ? 'ok' : 'fail',
            detail: typeof video.canPlayType === 'function' ? 'HTMLVideoElement OK' : 'Video HTML nao suportado',
        },
        {
            name: 'HLS para canais ao vivo',
            status: hlsPlayback ? 'ok' : 'fail',
            detail: nativeHls ? 'HLS nativo suportado' : mediaSource ? 'MediaSource disponivel para HLS.js' : 'Sem HLS nativo e sem MediaSource',
        },
        {
            name: 'MediaSource/HLS.js',
            status: mediaSource && sourceBuffer ? 'ok' : nativeHls ? 'warn' : 'fail',
            detail: mediaSource && sourceBuffer ? 'MSE e SourceBuffer disponiveis' : nativeHls ? 'Sem MSE, mas HLS nativo pode tocar' : 'MSE indisponivel',
        },
        {
            name: 'MP4 H.264/AAC',
            status: mp4H264 ? 'ok' : 'warn',
            detail: mp4H264 ? 'MP4 H.264/AAC suportado' : 'Codec MP4 nao confirmado pelo navegador',
        },
        {
            name: 'Fullscreen',
            status: document.fullscreenEnabled || 'webkitFullscreenEnabled' in document ? 'ok' : 'warn',
            detail: document.fullscreenEnabled ? 'Fullscreen padrao disponivel' : 'Pode depender de fullscreen nativo da TV',
        },
        {
            name: 'Legendas HTML5',
            status: 'textTracks' in video ? 'ok' : 'warn',
            detail: 'textTracks' in video ? 'TextTracks disponivel' : 'TextTracks nao identificado',
        },
    ];
}

export default function DebugPage() {
    const [checks, setChecks] = useState<DebugCheck[]>([]);
    const [info, setInfo] = useState<BrowserInfo | null>(null);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setInfo(getBrowserInfo());
            setChecks(buildChecks());
        }, 0);

        return () => window.clearTimeout(timeoutId);
    }, []);

    const hasFailures = checks.some(check => check.status === 'fail');
    const hasWarnings = checks.some(check => check.status === 'warn');

    return (
        <main className="min-h-screen bg-[#111] text-white px-5 py-6">
            <div className="mx-auto max-w-5xl">
                <div className="mb-6">
                    <Link href="/" className="text-red-300 underline font-semibold">Voltar ao app</Link>
                    <h1 className="mt-4 text-3xl font-bold">Diagnostico do navegador</h1>
                    <p className="mt-2 text-gray-300">
                        Checklist das funcionalidades usadas pelo app nesta TV/browser.
                    </p>
                </div>

                <section className={`mb-6 rounded-xl border p-4 ${hasFailures ? 'border-red-500/50 bg-red-500/10' : hasWarnings ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-emerald-500/50 bg-emerald-500/10'}`}>
                    <h2 className="text-xl font-bold">
                        {hasFailures ? 'Ha falhas de compatibilidade' : hasWarnings ? 'Ha avisos de compatibilidade' : 'Compatibilidade principal OK'}
                    </h2>
                    <p className="mt-1 text-sm text-gray-200">
                        Se o player ficar carregando, confira principalmente HLS, MediaSource, MP4 e Elemento de video.
                    </p>
                </section>

                <section className="mb-6 rounded-xl border border-white/10 bg-black/30 p-4">
                    <h2 className="mb-3 text-xl font-bold">Informacoes do browser</h2>
                    {info && (
                        <div className="grid gap-2 text-sm md:grid-cols-2">
                            <p><strong>Chrome/Chromium:</strong> {info.chromeVersion}</p>
                            <p><strong>Plataforma:</strong> {info.platform}</p>
                            <p><strong>Idioma:</strong> {info.language}</p>
                            <p><strong>Online:</strong> {info.online}</p>
                            <p><strong>Cookies:</strong> {info.cookies}</p>
                            <p><strong>Tela:</strong> {info.screen}</p>
                            <p><strong>Viewport:</strong> {info.viewport}</p>
                            <p><strong>Memoria:</strong> {info.deviceMemory}</p>
                            <p><strong>CPU:</strong> {info.cpuCores}</p>
                            <p className="md:col-span-2 break-words"><strong>User-Agent:</strong> {info.userAgent}</p>
                        </div>
                    )}
                </section>

                <section className="grid gap-3">
                    {checks.map(check => (
                        <div key={check.name} className="rounded-xl border border-white/10 bg-black/30 p-4">
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <h3 className="text-lg font-semibold">{check.name}</h3>
                                <span className={`w-fit rounded-full border px-3 py-1 text-xs font-bold ${statusStyle[check.status]}`}>
                                    {statusLabel[check.status]}
                                </span>
                            </div>
                            <p className="mt-2 text-sm text-gray-300">{check.detail}</p>
                        </div>
                    ))}
                </section>
            </div>
        </main>
    );
}
