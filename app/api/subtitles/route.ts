import { NextResponse } from 'next/server';

const OPENSUBTITLES_API_BASE = 'https://api.opensubtitles.com/api/v1';

function srtToVtt(srt: string): string {
    let vtt = 'WEBVTT\n\n';
    // Replace SRT timestamp format (00:00:00,000) with VTT format (00:00:00.000)
    vtt += srt
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
        // Remove SRT numbering lines (standalone numbers before timestamps)
        .replace(/^\d+\n(?=\d{2}:\d{2}:\d{2})/gm, '');
    return vtt;
}

/**
 * Fetch with rate limit handling and exponential backoff.
 * Best practice: https://opensubtitles.stoplight.io/docs/opensubtitles-api/6ef2e232095c7-best-practices
 */
async function fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries: number = 3
): Promise<Response> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetch(url, {
            ...options,
            redirect: 'follow', // Best practice: always follow HTTP redirects
        });

        // Rate limited (429) — apply exponential backoff
        if (response.status === 429 && attempt < maxRetries) {
            const resetTime = response.headers.get('ratelimit-reset');
            const waitMs = resetTime
                ? Math.max((parseInt(resetTime) * 1000) - Date.now(), 1000)
                : Math.pow(2, attempt + 1) * 1000; // Exponential: 2s, 4s, 8s

            console.warn(`[Subtitles] Rate limited (429). Waiting ${waitMs}ms before retry ${attempt + 1}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, waitMs));
            continue;
        }

        return response;
    }

    // Should never reach here, but just in case
    throw new Error('Max retries exceeded');
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { action, apiKey, ...params } = body;

        if (!apiKey) {
            return NextResponse.json(
                { error: 'OpenSubtitles API key is required' },
                { status: 400 }
            );
        }

        const headers: Record<string, string> = {
            'Api-Key': apiKey,
            'Content-Type': 'application/json',
            'User-Agent': 'XStreamPlayer v1.0',
        };

        if (action === 'search') {
            const { query, languages, season_number, episode_number, year, tmdb_id, parent_tmdb_id } = params;

            // Best practice: build clean search params
            const searchParams = new URLSearchParams();
            if (query) searchParams.append('query', query.replace(/\s+/g, '+'));
            if (languages) searchParams.append('languages', languages.toLowerCase());
            if (season_number) searchParams.append('season_number', String(season_number));
            if (episode_number) searchParams.append('episode_number', String(episode_number));
            if (year) searchParams.append('year', String(year));
            if (tmdb_id) searchParams.append('tmdb_id', String(tmdb_id));
            if (parent_tmdb_id) searchParams.append('parent_tmdb_id', String(parent_tmdb_id));

            // Sort params alphabetically (best practice)
            searchParams.sort();

            const url = `${OPENSUBTITLES_API_BASE}/subtitles?${searchParams.toString()}`;
            console.log(`[Subtitles] Searching: ${url}`);

            const response = await fetchWithRetry(url, {
                method: 'GET',
                headers: { 'Api-Key': apiKey, 'User-Agent': 'XStreamPlayer v1.0' },
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[Subtitles] Search error: ${response.status}`, errorText);
                return NextResponse.json(
                    { error: `OpenSubtitles API error: ${response.status}` },
                    { status: response.status }
                );
            }

            const data = await response.json();

            // Best practice: forward rate limit info to client
            const rateLimitRemaining = response.headers.get('ratelimit-remaining');
            console.log(`[Subtitles] Found ${data.total_count || 0} results (rate limit remaining: ${rateLimitRemaining})`);

            return NextResponse.json({
                ...data,
                _ratelimit: {
                    remaining: rateLimitRemaining ? parseInt(rateLimitRemaining) : null,
                    limit: response.headers.get('ratelimit-limit'),
                },
            });

        } else if (action === 'download') {
            const { file_id } = params;

            if (!file_id) {
                return NextResponse.json(
                    { error: 'file_id is required for download' },
                    { status: 400 }
                );
            }

            // Step 1: Request a fresh download link (best practice: always request fresh link)
            const downloadResponse = await fetchWithRetry(`${OPENSUBTITLES_API_BASE}/download`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ file_id }),
            });

            // Handle download quota exceeded (407)
            if (downloadResponse.status === 407) {
                console.warn('[Subtitles] Download quota exceeded (407)');
                return NextResponse.json(
                    { error: 'Limite diário de downloads atingido. Tente novamente amanhã (reset à meia-noite UTC).' },
                    { status: 407 }
                );
            }

            if (!downloadResponse.ok) {
                const errorText = await downloadResponse.text();
                console.error(`[Subtitles] Download request error: ${downloadResponse.status}`, errorText);
                return NextResponse.json(
                    { error: `Download request failed: ${downloadResponse.status}` },
                    { status: downloadResponse.status }
                );
            }

            const downloadData = await downloadResponse.json();
            const downloadLink = downloadData.link;
            const remaining = downloadData.remaining;

            if (!downloadLink) {
                return NextResponse.json(
                    { error: 'No download link returned' },
                    { status: 500 }
                );
            }

            console.log(`[Subtitles] Downloading from: ${downloadLink} (remaining today: ${remaining})`);

            // Step 2: Fetch the actual subtitle file (follow redirects)
            const srtResponse = await fetch(downloadLink, { redirect: 'follow' });
            if (!srtResponse.ok) {
                return NextResponse.json(
                    { error: `Failed to download subtitle file: ${srtResponse.status}` },
                    { status: 500 }
                );
            }

            const srtContent = await srtResponse.text();

            // Step 3: Convert SRT to WebVTT
            const vttContent = srtToVtt(srtContent);

            console.log(`[Subtitles] Converted SRT to VTT (${vttContent.length} chars)`);

            // Return VTT + remaining quota in headers
            return new Response(vttContent, {
                headers: {
                    'Content-Type': 'text/vtt; charset=utf-8',
                    'X-Downloads-Remaining': String(remaining ?? ''),
                },
            });

        } else {
            return NextResponse.json(
                { error: `Unknown action: ${action}` },
                { status: 400 }
            );
        }

    } catch (error: any) {
        console.error('[Subtitles] CRITICAL Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', details: error.message },
            { status: 500 }
        );
    }
}
