'use client';

import { useCallback } from 'react';
import { useAuth } from '@/app/context/AuthContext';

/**
 * Consulta o Xtream (user_info) para saber se o limite de conexões simultâneas
 * foi atingido. Retorna true quando `active_cons >= max_connections`.
 * max_connections == 0 é tratado como ilimitado.
 */
export function useConnectionLimit() {
    const { credentials } = useAuth();

    return useCallback(async (): Promise<boolean> => {
        if (!credentials) return false;
        try {
            const res = await fetch('/api/proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...credentials, action: '' }),
            });
            const data = await res.json();
            const info = data?.user_info;
            const active = parseInt(info?.active_cons ?? '0', 10);
            const max = parseInt(info?.max_connections ?? '0', 10);
            if (!Number.isFinite(max) || max <= 0) return false;
            return Number.isFinite(active) && active >= max;
        } catch {
            return false;
        }
    }, [credentials]);
}
