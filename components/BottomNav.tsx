'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Heart, Calendar, RefreshCw } from 'lucide-react';
import { useData } from '../app/context/DataContext';

const mobileLinks = [
    { name: 'Início', icon: Home, path: '/dashboard' },
    { name: 'Busca', icon: Search, path: '/dashboard/search' },
    { name: 'EPG', icon: Calendar, path: '/dashboard/epg' },
    { name: 'Favoritos', icon: Heart, path: '/dashboard/favorites' },
];

export default function BottomNav() {
    const pathname = usePathname();
    const { syncData, isSyncing, syncProgress } = useData();

    return (
        <nav className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-xl border-t border-white/10 flex items-center justify-around h-16 px-2 z-[60] md:hidden">
            {mobileLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.path || (link.path !== '/dashboard' && pathname.startsWith(link.path));

                return (
                    <Link
                        key={link.path}
                        href={link.path}
                        data-focusable="true"
                        tabIndex={0}
                        className={`flex flex-col items-center justify-center flex-1 py-1 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-red-600 rounded-lg relative ${isActive ? 'text-red-500' : 'text-gray-400'
                            }`}
                    >
                        <Icon size={20} className={isActive ? 'scale-110' : ''} />
                        <span className="text-[10px] mt-1 font-medium">{link.name}</span>
                        {isActive && (
                            <div className="absolute top-0 w-8 h-0.5 bg-red-600 rounded-full shadow-[0_0_10px_#e50914]" />
                        )}
                    </Link>
                );
            })}

            <button
                onClick={syncData}
                disabled={isSyncing}
                data-focusable="true"
                tabIndex={0}
                className={`flex flex-col items-center justify-center flex-1 py-1 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-red-600 rounded-lg ${isSyncing ? 'text-red-500' : 'text-gray-400'
                    }`}
            >
                <div className="relative">
                    <RefreshCw size={20} className={isSyncing ? 'animate-spin' : ''} />
                    {isSyncing && (
                        <span className="absolute -top-4 -right-4 bg-red-600 text-white text-[8px] font-bold px-1 rounded-full">
                            {syncProgress}%
                        </span>
                    )}
                </div>
                <span className="text-[10px] mt-1 font-medium">{isSyncing ? 'Sincronizando' : 'Sincronizar'}</span>
            </button>
        </nav>
    );
}
