'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Bookmark, Radio, Settings } from 'lucide-react';
import { useT } from '@/app/context/I18nContext';

const mobileLinks = [
    { labelKey: 'home', icon: Home, path: '/dashboard' },
    { labelKey: 'search', icon: Search, path: '/dashboard/search' },
    { labelKey: 'myList', icon: Bookmark, path: '/dashboard/favorites' },
    { labelKey: 'tvMode', icon: Radio, path: '/dashboard/tv' },
    { labelKey: 'settings', icon: Settings, path: '/dashboard/settings' },
];

/** Mobile tab bar. Sync moved to Ajustes; categories stay reachable from home shortcuts. */
export default function BottomNav() {
    const pathname = usePathname();
    const t = useT();

    return (
        <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-line flex items-center justify-around h-16 px-2 z-[60] md:hidden">
            {mobileLinks.map((link) => {
                const Icon = link.icon;
                const isActive = link.path === '/dashboard' ? pathname === link.path : pathname.startsWith(link.path);

                return (
                    <Link
                        key={link.path}
                        href={link.path}
                        data-focusable="true"
                        tabIndex={0}
                        className={[
                            'flex flex-col items-center justify-center flex-1 py-1 relative rounded-lg',
                            isActive ? 'text-ink' : 'text-ink-3',
                        ].join(' ')}
                    >
                        <Icon size={20} />
                        <span className="text-xs mt-1 font-medium">{t(`nav.${link.labelKey}`)}</span>
                        {isActive && <span className="absolute top-0 w-8 h-0.5 bg-ink rounded-full" />}
                    </Link>
                );
            })}
        </nav>
    );
}
