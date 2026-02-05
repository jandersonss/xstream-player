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

        const url = `${TMDB_API_BASE}${endpoint}?${queryParams.toString()}`;

        const response = await fetch(url);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return NextResponse.json(
                { error: errorData.status_message || 'TMDb API request failed' },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error('TMDb API error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
