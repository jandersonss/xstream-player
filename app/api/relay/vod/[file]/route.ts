import { NextResponse } from 'next/server';
import { enforceRemoteAccessForApi } from '@/app/lib/remoteAccess';
import {
    ensureVodBroadcast,
    waitForPlaylist,
    readSegment,
    type VodType,
} from '@/app/lib/vodBroadcast';

export const runtime = 'nodejs';

const VALID_TYPES: VodType[] = ['movie', 'series'];

function keyFor(type: string, streamId: string) {
    return `${type}_${streamId}`;
}

/** Reescreve o index.m3u8 do ffmpeg para segmentos/init passarem pelo relay. */
function rewritePlaylist(text: string, key: string): string {
    const q = `?key=${encodeURIComponent(key)}`;
    return text
        .split('\n')
        .map((line) => {
            const trimmed = line.trim();
            // Init do fMP4: #EXT-X-MAP:URI="init.mp4"
            if (trimmed.startsWith('#EXT-X-MAP:')) {
                return line.replace(/URI="([^"]+)"/, (_m, uri) => `URI="${uri}${q}"`);
            }
            // Linha de segmento (.m4s no fMP4; .ts mantido por compatibilidade).
            if (trimmed && !trimmed.startsWith('#') && (trimmed.endsWith('.m4s') || trimmed.endsWith('.ts'))) {
                return `${trimmed}${q}`;
            }
            return line;
        })
        .join('\n');
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ file: string }> }
) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    const { file } = await params;
    const { searchParams } = new URL(request.url);

    // ---- Segmento (fMP4 .m4s / init.mp4; .ts por compatibilidade) ----
    if (file.endsWith('.m4s') || file === 'init.mp4' || file.endsWith('.ts')) {
        const key = searchParams.get('key');
        if (!key) {
            return NextResponse.json({ error: 'key ausente' }, { status: 400 });
        }
        const data = await readSegment(key, file);
        if (!data) {
            return NextResponse.json({ error: 'Segmento indisponível' }, { status: 404 });
        }
        const contentType = file.endsWith('.ts') ? 'video/mp2t' : 'video/mp4';
        return new NextResponse(new Uint8Array(data), {
            status: 200,
            headers: { 'content-type': contentType, 'cache-control': 'no-store' },
        });
    }

    // ---- Playlist (entrada) ----
    if (file.endsWith('.m3u8')) {
        const type = searchParams.get('type') || '';
        const streamId = searchParams.get('streamId') || '';
        const ext = searchParams.get('ext') || 'mp4';
        const startParam = searchParams.get('start') || '0';

        if (!VALID_TYPES.includes(type as VodType) || !/^\d+$/.test(streamId) || !/^[a-z0-9]{1,5}$/i.test(ext)) {
            return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
        }
        if (!/^\d{1,6}$/.test(startParam)) {
            return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
        }

        const result = await ensureVodBroadcast(type as VodType, streamId, ext, Number(startParam));
        if ('error' in result) {
            return NextResponse.json({ error: result.error }, { status: 503 });
        }

        const playlist = await waitForPlaylist(result.key, result.dir);
        if (!playlist) {
            return NextResponse.json({ error: 'Transmissão não iniciou a tempo' }, { status: 504 });
        }

        const rewritten = rewritePlaylist(playlist, keyFor(type, streamId));
        return new NextResponse(rewritten, {
            status: 200,
            headers: {
                'content-type': 'application/vnd.apple.mpegurl',
                'cache-control': 'no-store',
            },
        });
    }

    return NextResponse.json({ error: 'Recurso inválido' }, { status: 400 });
}
