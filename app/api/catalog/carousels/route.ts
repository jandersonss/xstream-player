import { NextResponse } from 'next/server';
import { enforceRemoteAccessForApi } from '@/app/lib/remoteAccess';
import { getBackendCarousels } from '@/app/lib/catalogServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const remoteAccessResponse = await enforceRemoteAccessForApi(request);
    if (remoteAccessResponse) return remoteAccessResponse;

    try {
        const carousels = await getBackendCarousels();
        return NextResponse.json({ data: carousels });
    } catch (error) {
        console.error('[API Carousels] Request failed:', error);
        return NextResponse.json({ error: 'Failed to fetch catalog carousels' }, { status: 500 });
    }
}
