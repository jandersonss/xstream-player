'use client';

import { RefreshCw } from 'lucide-react';
import type { SyncRole } from '@/app/hooks/useLiveShare';
import { useT } from '@/app/context/I18nContext';

/**
 * Button to sync time between players. Should only be rendered when the players
 * are out of sync (the useSyncPlayback hook controls that).
 *
 * Neutral surface tones, not amber: this is an action the user can take, not a
 * system status indicator (spec 00 §2.1 reserves amber/green for system state).
 */
export default function SyncButton({ role, onClick }: { role: SyncRole; onClick: () => void }) {
    const t = useT();
    const label = role === 'broadcaster' ? t('broadcast.syncAll') : t('broadcast.sync');
    return (
        <button
            onClick={onClick}
            data-focusable="true"
            tabIndex={0}
            className="flex items-center space-x-2 h-10 px-4 rounded-full text-sm font-semibold bg-surface-2 border border-line-strong text-ink"
            title={role === 'broadcaster' ? t('broadcast.syncAllTitle') : t('broadcast.syncTitle')}
        >
            <RefreshCw size={18} />
            <span>{label}</span>
        </button>
    );
}
