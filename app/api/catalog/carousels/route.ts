import { NextResponse } from 'next/server';
import { enforceApiAccess } from '@/app/lib/apiAuth';
import { getBackendCarousels } from '@/app/lib/catalogServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const accessResponse = await enforceApiAccess(request);
    if (accessResponse) return accessResponse;

    try {
        const carousels = await getBackendCarousels();
        return NextResponse.json({ data: carousels });
    } catch (error) {
        console.error('[API Carousels] Request failed:', error);
        return NextResponse.json({ error: 'Failed to fetch catalog carousels' }, { status: 500 });
    }
}
