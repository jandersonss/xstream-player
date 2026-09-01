'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/app/lib/apiClient';

/** Conexões em uso / limite da conta, relidas do provedor em intervalo fixo. */
export interface AccountStatus {
    activeConnections: number;
    maxConnections: number;
}

const POLL_MS = 30 * 1000;

/**
 * Mantém o contador de conexões da conta atualizado enquanto a tela está aberta.
 * Os números vêm do provedor, então refletem o uso de todos os dispositivos.
 */
export function useAccountStatus(): AccountStatus | null {
    const [status, setStatus] = useState<AccountStatus | null>(null);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                const res = await apiFetch('/api/account');
                if (!res.ok) return;
                const { data } = await res.json() as { data: { active_cons?: string | number; max_connections?: string | number } };
                if (cancelled) return;

                const active = parseInt(String(data.active_cons ?? '0'), 10);
                const max = parseInt(String(data.max_connections ?? '0'), 10);
                if (!Number.isFinite(active) || !Number.isFinite(max)) return;

                setStatus({ activeConnections: active, maxConnections: max });
            } catch {
                // Keep the last known value on a failed poll.
            }
        };

        load();
        const timer = setInterval(load, POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, []);

    return status;
}
