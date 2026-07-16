'use client';

import { RefreshCw } from 'lucide-react';
import type { SyncRole } from '@/app/hooks/useLiveShare';

/**
 * Button to sync time between players. Should only be rendered when the players
 * are out of sync (the useSyncPlayback hook controls that).
 */
export default function SyncButton({ role, onClick }: { role: SyncRole; onClick: () => void }) {
    const label = role === 'broadcaster' ? 'Sincronizar todos' : 'Sincronizar';
    return (
        <button
            onClick={onClick}
            data-focusable="true"
            className="flex items-center space-x-2 px-3 py-2 rounded-full text-sm font-semibold bg-amber-500 text-black hover:bg-amber-400 transition-all shadow-xl focus:outline-none focus:ring-2 focus:ring-white animate-in fade-in"
            title={role === 'broadcaster' ? 'Levar todos os aparelhos ao seu tempo' : 'Ir para o tempo do transmissor'}
        >
            <RefreshCw size={18} />
            <span>{label}</span>
        </button>
    );
}
