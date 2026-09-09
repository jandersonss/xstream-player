'use client';

import { useRouter } from 'next/navigation';
import { useT } from '@/app/context/I18nContext';
import Button from '@/components/ui/Button';
import SectionHeader from '@/components/ui/SectionHeader';
import { Stethoscope } from 'lucide-react';

// Declared as a constant instead of importing package.json: that JSON import
// would pull build metadata into a client bundle unnecessarily.
const APP_VERSION = '1.17.0';

/** Link to /debug + app version (spec 02 §5.7). */
export default function DiagnosticsSection() {
    const router = useRouter();
    const t = useT();

    return (
        <div>
            <SectionHeader title={t('settings.diagnostics.title')} />
            <Button variant="ghost" icon={Stethoscope} onClick={() => router.push('/debug')}>
                {t('settings.diagnostics.open')}
            </Button>
            <p className="text-xs text-ink-3 mt-4 tnum">{t('settings.diagnostics.version', { version: APP_VERSION })}</p>
        </div>
    );
}
