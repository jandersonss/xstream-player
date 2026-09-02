'use client';

import React from 'react';
import { LucideIcon, Inbox } from 'lucide-react';

export interface EmptyStateProps {
    icon?: LucideIcon;
    title: string;
    description?: string;
    action?: React.ReactNode;
    compact?: boolean;
}

export default function EmptyState({
    icon: Icon = Inbox,
    title,
    description,
    action,
    compact = false,
}: EmptyStateProps) {
    return (
        <div
            className={[
                'flex flex-col items-center justify-center text-center',
                compact ? 'py-8 px-4' : 'py-16 px-6',
            ].join(' ')}
        >
            <Icon size={compact ? 28 : 36} className="text-ink-3 mb-3" />
            <p className="text-sm md:text-base font-medium text-ink">{title}</p>
            {description && <p className="text-xs md:text-sm text-ink-2 mt-1.5 max-w-md">{description}</p>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}
