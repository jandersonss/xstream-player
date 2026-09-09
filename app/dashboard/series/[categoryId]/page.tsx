'use client';

import { useParams } from 'next/navigation';
import CatalogListing from '@/components/catalog/CatalogListing';
import { useT } from '@/app/context/I18nContext';

export default function SeriesList() {
    const { categoryId } = useParams<{ categoryId: string }>();
    const t = useT();
    return <CatalogListing type="series" categoryId={categoryId} backHref="/dashboard/series" fallbackTitle={t('catalog.seriesTitle')} />;
}
