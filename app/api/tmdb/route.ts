import { NextRequest, NextResponse } from 'next/server';

const TMDB_API_BASE = 'https://api.themoviedb.org/3';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { apiKey, endpoint, params } = body;

        if (!apiKey) {
            return NextResponse.json(
                { error: 'API key is required' },
                { status: 400 }
            );
        }

        if (!endpoint) {
            return NextResponse.json(
                { error: 'Endpoint is required' },
                { status: 400 }
            );
        }

        // Build query string
        const queryParams = new URLSearchParams({
            api_key: apiKey,
            language: 'pt-BR',
            ...params
        });

        // Construct full URL (logging partial for security)
        const urlString = `${TMDB_API_BASE}${endpoint}?${queryParams.toString()}`;
        console.log(`[API Route] Fetching from TMDB: ${TMDB_API_BASE}${endpoint}`); // Log base path without params to avoid leaking key in logs if simple console

        const response = await fetch(urlString);

        if (!response.ok) {
            console.error(`[API Route] TMDB Error ${response.status} for ${endpoint}`);
            const errorData = await response.json().catch(() => ({}));
            console.error(`[API Route] Error Details:`, errorData);
            return NextResponse.json(
                { error: errorData.status_message || 'TMDb API request failed', details: errorData },
                { status: response.status }
            );
        }

        const data = await response.json();
        console.log(`[API Route] Success ${endpoint}, items: ${data.results ? data.results.length : 'N/A'}`);
        return NextResponse.json(data);

    } catch (error) {
        console.error('TMDb API error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
