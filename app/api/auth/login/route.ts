import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { username, password, hostUrl } = body;

        if (!username || !password || !hostUrl) {
            return NextResponse.json(
                { error: 'Missing credentials or host URL' },
                { status: 400 }
            );
        }

        // Normalized URL: remove trailing slash
        const baseUrl = hostUrl.replace(/\/$/, '');
        const apiUrl = `${baseUrl}/player_api.php?username=${username}&password=${password}`;

        console.log(`Attempting login to: ${baseUrl} for user: ${username}`);

        const response = await fetch(apiUrl);

        if (!response.ok) {
            return NextResponse.json(
                { error: `Failed to connect to server: ${response.statusText}` },
                { status: response.status }
            );
        }

        const data = await response.json();

        if (data.user_info && data.user_info.auth === 0) {
            return NextResponse.json(
                { error: 'Authentication failed' },
                { status: 401 }
            );
        }

        // Persist config on server
        try {
            const fs = require('fs/promises');
            const path = require('path');
            const CONFIG_PATH = path.join(process.cwd(), 'data', 'config.json');
            const authData = {
                credentials: { hostUrl, username, password },
                user: data.user_info,
                server: data.server_info
            };
            await fs.writeFile(CONFIG_PATH, JSON.stringify(authData, null, 2));
        } catch (e) {
            console.error('Failed to persist config on server', e);
            // Non-critical error, proceed with login
        }

        return NextResponse.json(data);

    } catch (error: any) {
        console.error('Proxy Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', details: error.message },
            { status: 500 }
        );
    }
}
