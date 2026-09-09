'use client';

import CategoryBrowser from '@/components/catalog/CategoryBrowser';
import { useT } from '@/app/context/I18nContext';

export default function LiveCategories() {
    const t = useT();
    return <CategoryBrowser type="live" title={t('catalog.liveTitle')} />;
}
