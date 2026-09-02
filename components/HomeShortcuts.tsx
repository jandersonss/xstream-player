'use client';

import Link from 'next/link';
import { Tv, Film, Layers, LucideIcon } from 'lucide-react';

interface Shortcut {
    href: string;
    label: string;
    icon: LucideIcon;
}

// Replaces the three 256px Unsplash-photo cards from the old home: same
// three destinations, a fraction of the space, and the only category path
// on mobile (where the nav rail doesn't exist).
const SHORTCUTS: Shortcut[] = [
    { href: '/dashboard/live', label: 'Ao vivo', icon: Tv },
    { href: '/dashboard/movies', label: 'Filmes', icon: Film },
    { href: '/dashboard/series', label: 'Séries', icon: Layers },
];

export default function HomeShortcuts() {
    return (
        <div className="flex flex-wrap">
            {SHORTCUTS.map(({ href, label, icon: Icon }) => (
                <Link
                    key={href}
                    href={href}
                    data-focusable="true"
                    tabIndex={0}
                    className="h-12 px-5 mr-3 mb-3 rounded-full bg-surface-2 border border-line flex items-center text-ink"
                >
                    <Icon size={18} className="mr-2" />
                    <span className="text-sm md:text-base">{label}</span>
                </Link>
            ))}
        </div>
    );
}
