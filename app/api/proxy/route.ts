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

        console.log(`[Proxy] Action: ${action} | URL: ${apiUrl}`);
        if (Object.keys(otherParams).length > 0) {
            console.log(`[Proxy] Params:`, JSON.stringify(otherParams));
        }

        let response;
        let lastError;
        const maxRetries = 3;

        for (let i = 0; i <= maxRetries; i++) {
            try {
                response = await fetch(apiUrl);

                if (response.ok || response.status < 500) {
                    break;
                }

                if (i < maxRetries) {
                    console.warn(`[Proxy] Retry ${i + 1}/${maxRetries} for ${action} due to status ${response.status}`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error) {
                lastError = error;
                if (i < maxRetries) {
                    console.warn(`[Proxy] Retry ${i + 1}/${maxRetries} for ${action} due to error:`, error);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }

        if (!response) {
            throw lastError || new Error('Fetch failed after retries');
        }

        console.log(`[Proxy] Response: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            return NextResponse.json(
                { error: `Upstream error: ${response.statusText}`, details: response.status === 504 ? 'Gateway Timeout' : undefined },
                { status: response.status }
            );
        }

        const contentType = response.headers.get('content-type');
        let data;
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
            const count = Array.isArray(data) ? data.length : 'object';
            console.log(`[Proxy] Data: ${count} items/type`);
        } else {
            const text = await response.text();
            console.log(`[Proxy] Data: Text (${text.length} chars)`);
            try {
                data = JSON.parse(text);
            } catch (e) {
                data = text;
            }
        }

        return NextResponse.json(data);

    } catch (error: any) {
        console.error('[Proxy] CRITICAL Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', details: error.message },
            { status: 500 }
        );
    }
}
