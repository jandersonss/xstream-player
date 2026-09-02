'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Home,
    Search,
    Bookmark,
    Tv,
    Film,
    Layers,
    Radio,
    MonitorSmartphone,
    Settings,
    User,
} from 'lucide-react';
import { useData } from '@/app/context/DataContext';
import { useProfile } from '@/app/context/ProfileContext';
import ProfileModal from './ProfileModal';

interface NavItem {
    name: string;
    icon: typeof Home;
    path: string;
}

const CONTENT_ITEMS: NavItem[] = [
    { name: 'Início', icon: Home, path: '/dashboard' },
    { name: 'Buscar', icon: Search, path: '/dashboard/search' },
    { name: 'Minha lista', icon: Bookmark, path: '/dashboard/favorites' },
    { name: 'Ao vivo', icon: Tv, path: '/dashboard/live' },
    { name: 'Filmes', icon: Film, path: '/dashboard/movies' },
    { name: 'Séries', icon: Layers, path: '/dashboard/series' },
];

const SYSTEM_ITEMS: NavItem[] = [
    { name: 'Modo TV', icon: Radio, path: '/dashboard/tv' },
    { name: 'Aparelhos', icon: MonitorSmartphone, path: '/dashboard/devices' },
    { name: 'Ajustes', icon: Settings, path: '/dashboard/settings' },
];

/** Content-only navigation rail — administrative controls live in Ajustes now. */
export default function NavRail() {
    const pathname = usePathname();
    const { isSyncing, syncProgress } = useData();
    const { activeProfile } = useProfile();
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const asideRef = useRef<HTMLElement>(null);

    // '/dashboard' is a prefix of every route, so it only matches exactly.
    const isActive = (path: string) => (path === '/dashboard' ? pathname === path : pathname.startsWith(path));

    // `:focus-within` does not exist on Chromium 53 (spec 02 §2): React's onFocus/onBlur
    // bubble like native focusin/focusout, so tracking them on the <aside> reproduces it.
    const handleBlur = (e: React.FocusEvent<HTMLElement>) => {
        if (asideRef.current && !asideRef.current.contains(e.relatedTarget as Node)) {
            setIsExpanded(false);
        }
    };

    const renderItem = (item: NavItem) => {
        const active = isActive(item.path);
        const Icon = item.icon;

        return (
            <Link
                key={item.path}
                href={item.path}
                data-focusable="true"
                tabIndex={0}
                className={[
                    'flex items-center px-3 py-2 rounded-lg relative overflow-hidden transition-colors',
                    active ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:text-ink',
                ].join(' ')}
            >
                {active && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-ink" />}
                <Icon size={22} className="flex-shrink-0" />
                {isExpanded && <span className="ml-3 text-sm truncate">{item.name}</span>}
            </Link>
        );
    };

    return (
        <aside
            ref={asideRef}
            onFocus={() => setIsExpanded(true)}
            onBlur={handleBlur}
            className={[
                'hidden md:flex flex-col h-full bg-bg border-r border-line relative flex-shrink-0',
                'transition-all duration-200',
                isExpanded ? 'w-[248px]' : 'w-[76px]',
            ].join(' ')}
        >
            {/* Brand — not focusable, decorative only. */}
            <div className="flex items-center px-4 pt-6 pb-4 flex-shrink-0">
                <span className="text-xl font-black text-brand tracking-tighter leading-none">X</span>
                <span className="text-xl font-black text-ink tracking-tighter leading-none">stream</span>
            </div>

            {/* Profile */}
            <div className="px-3 pb-4 flex-shrink-0">
                <button
                    onClick={() => setShowProfileModal(true)}
                    data-focusable="true"
                    tabIndex={0}
                    title="Trocar perfil"
                    className="w-full flex items-center px-3 py-2 rounded-lg text-ink-2 hover:text-ink"
                >
                    <span className="w-8 h-8 flex-shrink-0 rounded-lg bg-surface-2 flex items-center justify-center text-ink text-xs font-bold uppercase">
                        {activeProfile?.name?.charAt(0) ?? <User size={16} />}
                    </span>
                    {isExpanded && (
                        <span className="ml-3 text-sm text-ink truncate">{activeProfile?.name ?? 'Perfil'}</span>
                    )}
                </button>
            </div>

            {/* Content navigation */}
            <nav className="flex-1 overflow-y-auto px-3 space-y-1">
                {CONTENT_ITEMS.map(renderItem)}
            </nav>

            <div className="border-t border-line mx-3" />

            {/* System navigation */}
            <nav className="px-3 py-3 space-y-1 flex-shrink-0">
                {SYSTEM_ITEMS.map(renderItem)}
            </nav>

            {/* Sync indicator — status only; the action itself lives in Ajustes. */}
            {isSyncing && (
                <div className="h-0.5 w-full bg-line flex-shrink-0">
                    <div
                        className="h-full bg-ink-2 transition-all duration-300"
                        style={{ width: `${syncProgress}%` }}
                    />
                </div>
            )}

            <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} />
        </aside>
    );
}
