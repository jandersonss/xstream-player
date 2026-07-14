import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { enforceRemoteAccessForApi } from '@/app/lib/remoteAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONFIG_PATH = path.join(process.cwd(), 'data', 'config.json');

interface StoredCredentials {
    hostUrl: string;
    username: string;
    password: string;
}

// Live account snapshot from the provider — connection counters move as devices
// start and stop streams, so the client re-reads this instead of trusting login.
export async function GET(request: Request) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    try {
        let creds: StoredCredentials;
        try {
            const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
            creds = JSON.parse(raw) as StoredCredentials;
        } catch {
            return NextResponse.json({ error: 'Credenciais não configuradas' }, { status: 404 });
        }

        const baseUrl = creds.hostUrl.replace(/\/$/, '');
        const response = await fetch(
            `${baseUrl}/player_api.php?username=${creds.username}&password=${creds.password}`,
            { cache: 'no-store' }
        );

        if (!response.ok) {
            return NextResponse.json({ error: 'Falha ao consultar o provedor' }, { status: 502 });
        }

        const data = await response.json();
        if (!data.user_info) {
            return NextResponse.json({ error: 'Resposta inválida do provedor' }, { status: 502 });
        }

        return NextResponse.json({ data: data.user_info });
    } catch (error) {
        console.error('[Account] Failed to fetch account info', error);
        return NextResponse.json({ error: 'Falha ao consultar a conta' }, { status: 500 });
    }
}
