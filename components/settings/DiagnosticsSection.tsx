'use client';

import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import SectionHeader from '@/components/ui/SectionHeader';
import { Stethoscope } from 'lucide-react';

// Declared as a constant instead of importing package.json: that JSON import
// would pull build metadata into a client bundle unnecessarily.
const APP_VERSION = '1.15.1';

/** Link to /debug + app version (spec 02 §5.7). */
export default function DiagnosticsSection() {
    const router = useRouter();

    return (
        <div>
            <SectionHeader title="Diagnóstico" />
            <Button variant="ghost" icon={Stethoscope} onClick={() => router.push('/debug')}>
                Abrir diagnóstico
            </Button>
            <p className="text-xs text-ink-3 mt-4 tnum">Versão {APP_VERSION}</p>
        </div>
    );
}
