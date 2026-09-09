'use client';

import { useData } from '@/app/context/DataContext';
import { useT } from '@/app/context/I18nContext';
import Button from '@/components/ui/Button';
import SectionHeader from '@/components/ui/SectionHeader';
import { RefreshCw } from 'lucide-react';

/** Catalog sync — moved out of the nav rail (spec 02 §5.2). */
export default function CatalogSection() {
    const { syncData, isSyncing, syncProgress, lastSync } = useData();
    const t = useT();

    return (
        <div>
            <SectionHeader title={t('settings.catalog.title')} />
            <p className="text-sm text-ink-2 mb-4">
                {lastSync
                    ? t('settings.catalog.lastUpdate', { date: new Date(lastSync).toLocaleDateString() })
                    : t('settings.catalog.notSynced')}
            </p>

            {isSyncing && (
                <div className="mb-4">
                    <div className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
                        <div
                            className="h-full bg-ink transition-all duration-300"
                            style={{ width: `${syncProgress}%` }}
                        />
                    </div>
                    <p className="text-xs text-ink-2 mt-1.5 tnum">{t('settings.catalog.percentDone', { n: syncProgress })}</p>
                </div>
            )}

            <Button icon={RefreshCw} onClick={syncData} loading={isSyncing} disabled={isSyncing}>
                {isSyncing ? t('settings.catalog.syncing') : t('settings.catalog.update')}
            </Button>
        </div>
    );
}
