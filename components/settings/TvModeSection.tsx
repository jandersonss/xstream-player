'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAutoBroadcast, setAutoBroadcast } from '@/app/lib/device';
import { useT } from '@/app/context/I18nContext';
import Toggle from '@/components/ui/Toggle';
import Button from '@/components/ui/Button';
import SectionHeader from '@/components/ui/SectionHeader';
import { Radio, MonitorSmartphone } from 'lucide-react';

/** "Always broadcast" preference, moved out of the nav rail (spec 02 §5.6). */
export default function TvModeSection() {
    const router = useRouter();
    const t = useT();
    // Per-device preference — lazy init, no setState inside an effect.
    const [autoBroadcast, setAutoBroadcastOn] = useState(() => getAutoBroadcast());

    const toggleAutoBroadcast = (next: boolean) => {
        setAutoBroadcast(next);
        setAutoBroadcastOn(next);
    };

    return (
        <div>
            <SectionHeader title={t('settings.tvMode.title')} />

            <Toggle
                checked={autoBroadcast}
                onChange={toggleAutoBroadcast}
                label={t('settings.tvMode.alwaysBroadcast')}
                description={t('settings.tvMode.alwaysBroadcastDesc')}
            />

            <div className="flex space-x-2 mt-6">
                <Button variant="ghost" icon={Radio} onClick={() => router.push('/dashboard/tv')}>
                    {t('settings.tvMode.viewTvMode')}
                </Button>
                <Button variant="ghost" icon={MonitorSmartphone} onClick={() => router.push('/dashboard/devices')}>
                    {t('settings.tvMode.viewDevices')}
                </Button>
            </div>
        </div>
    );
}
