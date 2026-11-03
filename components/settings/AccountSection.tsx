'use client';

import { useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { useT } from '@/app/context/I18nContext';
import { useAccountStatus } from '@/app/hooks/useAccountStatus';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import SectionHeader from '@/components/ui/SectionHeader';
import Field, { inputClassName } from '@/components/ui/Field';
import { LogOut } from 'lucide-react';

function formatExpDate(timestamp: string): string {
    const date = new Date(parseInt(timestamp, 10) * 1000);
    return date.toLocaleDateString();
}

/** Account details, moved out of the home header pills (spec 02 §5.1). */
export default function AccountSection() {
    const { user, server, credentials, updateHost, logout } = useAuth();
    const [hostUrl, setHostUrl] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);
    const t = useT();
    const account = useAccountStatus();
    const isActive = user?.status === 'Active';

    const currentHost = credentials?.hostUrl ?? '';
    const canSave = hostUrl.trim() !== '' && hostUrl.trim() !== currentHost && !saving;

    const handleUpdateHost = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        setSaved(false);
        try {
            await updateHost(hostUrl.trim());
            setHostUrl('');
            setSaved(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('login.failedShort'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <SectionHeader title={t('settings.account.title')} />
            <dl className="space-y-3">
                <div className="flex items-center justify-between border-b border-line pb-3">
                    <dt className="text-sm text-ink-2">{t('settings.account.user')}</dt>
                    <dd className="text-sm text-ink truncate max-w-[60%]">{user?.username ?? '—'}</dd>
                </div>
                <div className="flex items-center justify-between border-b border-line pb-3">
                    <dt className="text-sm text-ink-2">{t('settings.account.validity')}</dt>
                    <dd className="text-sm text-ink tnum">
                        {user?.exp_date ? formatExpDate(user.exp_date) : t('settings.account.unlimited')}
                    </dd>
                </div>
                <div className="flex items-center justify-between border-b border-line pb-3">
                    <dt className="text-sm text-ink-2">{t('settings.account.status')}</dt>
                    <dd>
                        <Badge tone={isActive ? 'ok' : 'neutral'}>{user?.status ?? '—'}</Badge>
                    </dd>
                </div>
                <div className="flex items-center justify-between border-b border-line pb-3">
                    <dt className="text-sm text-ink-2">{t('settings.account.activeConnections')}</dt>
                    <dd className="text-sm text-ink tnum">
                        {account ? `${account.activeConnections}/${account.maxConnections}` : '—'}
                    </dd>
                </div>
                <div className="flex items-center justify-between border-b border-line pb-3">
                    <dt className="text-sm text-ink-2">{t('settings.account.serverUrl')}</dt>
                    <dd className="text-sm text-ink truncate max-w-[60%]">{server?.url ?? '—'}</dd>
                </div>
                <div className="flex items-center justify-between pb-1">
                    <dt className="text-sm text-ink-2">{t('settings.account.timezone')}</dt>
                    <dd className="text-sm text-ink">{server?.timezone ?? '—'}</dd>
                </div>
            </dl>

            <form onSubmit={handleUpdateHost} className="mt-6 space-y-3">
                <Field
                    label={t('settings.account.changeHost')}
                    htmlFor="change-host"
                    error={error}
                    hint={saved ? t('settings.account.hostUpdated') : t('settings.account.changeHostHint')}
                >
                    <input
                        id="change-host"
                        type="url"
                        placeholder={currentHost || 'http://example.com:8080'}
                        value={hostUrl}
                        onChange={(e) => { setHostUrl(e.target.value); setSaved(false); }}
                        className={inputClassName}
                        data-focusable="true"
                    />
                </Field>
                <Button type="submit" variant="secondary" loading={saving} disabled={!canSave}>
                    {t('settings.account.updateHost')}
                </Button>
            </form>

            <div className="mt-6">
                <Button variant="danger" icon={LogOut} onClick={logout}>
                    {t('settings.account.signOut')}
                </Button>
            </div>
        </div>
    );
}
