'use client';

import React from 'react';

export interface SectionHeaderProps {
    title: string;
    count?: number;
    action?: React.ReactNode;
    description?: string;
}

export default function SectionHeader({ title, count, action, description }: SectionHeaderProps) {
    return (
        <div className="flex items-center justify-between mb-3">
            <div>
                <h2 className="text-lg md:text-xl font-semibold text-ink">
                    {title}
                    {count !== undefined && <span className="tnum text-ink-2"> ({count})</span>}
                </h2>
                {description && <p className="text-xs md:text-sm text-ink-2 mt-1">{description}</p>}
            </div>
            {action}
        </div>
    );
}
