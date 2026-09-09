'use client';

import CategoryBrowser from '@/components/catalog/CategoryBrowser';
import { useT } from '@/app/context/I18nContext';

export default function MovieCategories() {
    const t = useT();
    return <CategoryBrowser type="movie" title={t('catalog.moviesTitle')} hero="movie" />;
}
