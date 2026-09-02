'use client';

import { useAuth } from '@/app/context/AuthContext';
import { useAccountStatus } from '@/app/hooks/useAccountStatus';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import SectionHeader from '@/components/ui/SectionHeader';
import { LogOut } from 'lucide-react';

function formatExpDate(timestamp: string): string {
    if (!timestamp) return 'Ilimitado';
    const date = new Date(parseInt(timestamp, 10) * 1000);
    return date.toLocaleDateString();
}

/** Account details, moved out of the home header pills (spec 02 §5.1). */
export default function AccountSection() {
    const { user, server, logout } = useAuth();
    const account = useAccountStatus();
    const isActive = user?.status === 'Active';

    return (
        <div>
            <SectionHeader title="Conta" />
            <dl className="space-y-3">
                <div className="flex items-center justify-between border-b border-line pb-3">
                    <dt className="text-sm text-ink-2">Usuário</dt>
                    <dd className="text-sm text-ink truncate max-w-[60%]">{user?.username ?? '—'}</dd>
                </div>
                <div className="flex items-center justify-between border-b border-line pb-3">
                    <dt className="text-sm text-ink-2">Validade</dt>
                    <dd className="text-sm text-ink tnum">
                        {user?.exp_date ? formatExpDate(user.exp_date) : 'Ilimitado'}
                    </dd>
                </div>
                <div className="flex items-center justify-between border-b border-line pb-3">
                    <dt className="text-sm text-ink-2">Status da conta</dt>
                    <dd>
                        <Badge tone={isActive ? 'ok' : 'neutral'}>{user?.status ?? '—'}</Badge>
                    </dd>
                </div>
                <div className="flex items-center justify-between border-b border-line pb-3">
                    <dt className="text-sm text-ink-2">Conexões ativas</dt>
                    <dd className="text-sm text-ink tnum">
                        {account ? `${account.activeConnections}/${account.maxConnections}` : '—'}
                    </dd>
                </div>
                <div className="flex items-center justify-between border-b border-line pb-3">
                    <dt className="text-sm text-ink-2">URL do servidor</dt>
                    <dd className="text-sm text-ink truncate max-w-[60%]">{server?.url ?? '—'}</dd>
                </div>
                <div className="flex items-center justify-between pb-1">
                    <dt className="text-sm text-ink-2">Fuso horário</dt>
                    <dd className="text-sm text-ink">{server?.timezone ?? '—'}</dd>
                </div>
            </dl>

            <div className="mt-6">
                <Button variant="danger" icon={LogOut} onClick={logout}>
                    Sair
                </Button>
            </div>
        </div>
    );
}
