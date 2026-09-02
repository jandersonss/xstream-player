'use client';

import { useParams } from 'next/navigation';
import CatalogListing from '@/components/catalog/CatalogListing';

export default function LiveStreams() {
    const { categoryId } = useParams<{ categoryId: string }>();
    return <CatalogListing type="live" categoryId={categoryId} backHref="/dashboard/live" fallbackTitle="Canais" />;
}
