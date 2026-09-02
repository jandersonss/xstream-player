'use client';

import { useParams } from 'next/navigation';
import CatalogListing from '@/components/catalog/CatalogListing';

export default function SeriesList() {
    const { categoryId } = useParams<{ categoryId: string }>();
    return <CatalogListing type="series" categoryId={categoryId} backHref="/dashboard/series" fallbackTitle="Séries" />;
}
