import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { enforceRemoteAccessForApi } from '@/app/lib/remoteAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONFIG_PATH = path.join(process.cwd(), 'data', 'config.json');

interface StoredConfig {
    credentials?: {
        hostUrl: string;
        username: string;
        password: string;
    };
}

// Live account snapshot from the provider — connection counters move as devices
// start and stop streams, so the client re-reads this instead of trusting login.
export async function GET(request: Request) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    try {
        let config: StoredConfig;
        try {
            const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
            config = JSON.parse(raw) as StoredConfig;
        } catch {
            return NextResponse.json({ error: 'Credenciais não configuradas' }, { status: 404 });
        }

        const creds = config.credentials;
        if (!creds?.hostUrl || !creds.username || !creds.password) {
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

        // user_info carries the plaintext password — only the counters go to the client.
        const { active_cons, max_connections, status } = data.user_info;
        return NextResponse.json({ data: { active_cons, max_connections, status } });
    } catch (error) {
        console.error('[Account] Failed to fetch account info', error);
        return NextResponse.json({ error: 'Falha ao consultar a conta' }, { status: 500 });
    }
}
