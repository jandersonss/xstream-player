'use client';

import { useParams } from 'next/navigation';
import CatalogListing from '@/components/catalog/CatalogListing';
import { useT } from '@/app/context/I18nContext';

export default function LiveStreams() {
    const { categoryId } = useParams<{ categoryId: string }>();
    const t = useT();
    return <CatalogListing type="live" categoryId={categoryId} backHref="/dashboard/live" fallbackTitle={t('catalog.channelsFallback')} />;
}
