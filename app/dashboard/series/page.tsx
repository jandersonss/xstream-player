'use client';

import CategoryBrowser from '@/components/catalog/CategoryBrowser';
import { useT } from '@/app/context/I18nContext';

export default function SeriesCategories() {
    const t = useT();
    return <CategoryBrowser type="series" title={t('catalog.seriesTitle')} hero="series" />;
}
