'use client';

import { useParams } from 'next/navigation';
import CatalogListing from '@/components/catalog/CatalogListing';
import { useT } from '@/app/context/I18nContext';

export default function MovieList() {
    const { categoryId } = useParams<{ categoryId: string }>();
    const t = useT();
    return <CatalogListing type="movie" categoryId={categoryId} backHref="/dashboard/movies" fallbackTitle={t('catalog.moviesTitle')} />;
}
