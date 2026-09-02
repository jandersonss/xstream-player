'use client';

import { useEffect, useState } from 'react';

interface LoaderProps {
    size?: 'small' | 'large';
    helpDelayMs?: number;
}

export default function Loader({ size = 'large', helpDelayMs = 15000 }: LoaderProps) {
    const isSmall = size === 'small';
    const [showHelp, setShowHelp] = useState(false);

    // Diagnostic escape hatch for a silently stuck TV: if loading never resolves
    // within helpDelayMs, surface a link to /debug instead of spinning forever.
    useEffect(() => {
        if (isSmall) return;

        const timeoutId = window.setTimeout(() => {
            setShowHelp(true);
        }, helpDelayMs);

        return () => window.clearTimeout(timeoutId);
    }, [helpDelayMs, isSmall]);

    return (
        <div className={`flex flex-col items-center justify-center ${isSmall ? 'py-4' : 'min-h-[50vh]'}`}>
            <div className={`relative ${isSmall ? 'w-8 h-8' : 'w-16 h-16'}`}>
                <div className={`absolute inset-0 rounded-full border-line ${isSmall ? 'border-2' : 'border-4'}`} />
                <div className={`absolute inset-0 rounded-full border-transparent border-t-ink animate-spin ${isSmall ? 'border-2' : 'border-4'}`} />
            </div>
            {showHelp && (
                <div className="mt-6 text-center text-sm text-ink-2">
                    <p className="mb-2">Carregamento demorando mais que o esperado.</p>
                    <a href="/debug" className="text-ink underline font-semibold">
                        Abrir diagnóstico
                    </a>
                </div>
            )}
        </div>
    );
}
