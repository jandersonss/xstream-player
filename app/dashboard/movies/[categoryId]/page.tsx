'use client';

import { useParams } from 'next/navigation';
import CatalogListing from '@/components/catalog/CatalogListing';

export default function MovieList() {
    const { categoryId } = useParams<{ categoryId: string }>();
    return <CatalogListing type="movie" categoryId={categoryId} backHref="/dashboard/movies" fallbackTitle="Filmes" />;
}
