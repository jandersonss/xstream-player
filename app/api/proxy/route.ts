import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { hostUrl, username, password, action, ...otherParams } = body;

        if (!hostUrl || !username || !password) {
            return NextResponse.json(
                { error: 'Missing credentials' },
                { status: 400 }
            );
        }

        const baseUrl = hostUrl.replace(/\/$/, '');
        const params = new URLSearchParams({
            username,
            password,
            action: action || '',
            ...otherParams
        });

        const apiUrl = `${baseUrl}/player_api.php?${params.toString()}`;

        // console.log(`Proxying action: ${action} to ${baseUrl}`);

        const response = await fetch(apiUrl);

        if (!response.ok) {
            return NextResponse.json(
                { error: `Upstream error: ${response.statusText}` },
                { status: response.status }
            );
        }

        const contentType = response.headers.get('content-type');
        let data;
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            // Some IPTV APIs return plain text even for successful actions
            const text = await response.text();
            try {
                data = JSON.parse(text);
            } catch (e) {
                // If not JSON, return as is or as an object
                data = text;
            }
        }

        return NextResponse.json(data);

    } catch (error: any) {
        console.error('Proxy Action Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', details: error.message },
            { status: 500 }
        );
    }
}
