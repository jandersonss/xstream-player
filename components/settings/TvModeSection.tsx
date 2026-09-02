'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAutoBroadcast, setAutoBroadcast } from '@/app/lib/device';
import Toggle from '@/components/ui/Toggle';
import Button from '@/components/ui/Button';
import SectionHeader from '@/components/ui/SectionHeader';
import { Radio, MonitorSmartphone } from 'lucide-react';

/** "Always broadcast" preference, moved out of the nav rail (spec 02 §5.6). */
export default function TvModeSection() {
    const router = useRouter();
    // Per-device preference — lazy init, no setState inside an effect.
    const [autoBroadcast, setAutoBroadcastOn] = useState(() => getAutoBroadcast());

    const toggleAutoBroadcast = (next: boolean) => {
        setAutoBroadcast(next);
        setAutoBroadcastOn(next);
    };

    return (
        <div>
            <SectionHeader title="Modo TV" />

            <Toggle
                checked={autoBroadcast}
                onChange={toggleAutoBroadcast}
                label="Transmitir sempre"
                description="Tudo que este aparelho abrir entra no Modo TV"
            />

            <div className="flex space-x-2 mt-6">
                <Button variant="ghost" icon={Radio} onClick={() => router.push('/dashboard/tv')}>
                    Ver Modo TV
                </Button>
                <Button variant="ghost" icon={MonitorSmartphone} onClick={() => router.push('/dashboard/devices')}>
                    Ver aparelhos
                </Button>
            </div>
        </div>
    );
}
