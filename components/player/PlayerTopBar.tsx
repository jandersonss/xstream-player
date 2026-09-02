'use client';

import React from 'react';
import { ArrowLeft } from 'lucide-react';
import IconButton from '@/components/ui/IconButton';

export interface PlayerTopBarProps {
    title?: string;
    subtitle?: string;
    onBack?: () => void;
    /** The `topRightSlot` VideoPlayer already receives from its own props. */
    rightSlot?: React.ReactNode;
    visible: boolean;
}

export default function PlayerTopBar({ title, subtitle, onBack, rightSlot, visible }: PlayerTopBarProps) {
    return (
        <div
            className="absolute top-0 left-0 w-full p-4 bg-gradient-to-b from-black/85 to-transparent flex items-center justify-between space-x-3"
            aria-hidden={!visible}
        >
            <div className="flex items-center space-x-3 min-w-0">
                {onBack && (
                    <IconButton icon={ArrowLeft} label="Voltar" onClick={onBack} className="focus-flat flex-shrink-0" />
                )}
                {title && (
                    <div className="min-w-0">
                        <p className="text-base md:text-xl font-semibold text-ink truncate">{title}</p>
                        {subtitle && (
                            <p className="text-sm text-ink-2 truncate">{subtitle}</p>
                        )}
                    </div>
                )}
            </div>
            {rightSlot}
        </div>
    );
}
