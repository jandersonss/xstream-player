'use client';

import { useEffect, useState } from 'react';

interface LoaderProps {
    size?: 'small' | 'large';
    helpDelayMs?: number;
}

export default function Loader({ size = 'large', helpDelayMs = 15000 }: LoaderProps) {
    const isSmall = size === 'small';
    const [showHelp, setShowHelp] = useState(false);

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
                <div className={`absolute top-0 left-0 w-full h-full rounded-full border-red-600 animate-spin border-t-transparent ${isSmall ? 'border-2' : 'border-4'}`} />
                {!isSmall && (
                    <div className="absolute top-0 left-0 w-full h-full border-4 border-[#333] rounded-full -z-10" />
                )}
            </div>
            {showHelp && (
                <div className="mt-6 text-center text-sm text-gray-300">
                    <p className="mb-2">Carregamento demorando mais que o esperado.</p>
                    <a href="/debug" className="text-red-400 underline font-semibold">
                        Abrir diagnostico
                    </a>
                </div>
            )}
        </div>
    );
}
