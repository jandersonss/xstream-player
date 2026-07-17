'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Tv, Film, Layers, LogOut, Search, Bookmark, RefreshCw, Radio, User, ChevronDown } from 'lucide-react';
import { useAuth } from '../app/context/AuthContext';
import { useData } from '../app/context/DataContext';
import { useProfile } from '../app/context/ProfileContext';
import { getAutoBroadcast, setAutoBroadcast } from '@/app/lib/device';
import ProfileModal from './ProfileModal';

const menuItems = [
    { name: 'Busca', icon: Search, path: '/dashboard/search' },
    { name: 'Início', icon: Home, path: '/dashboard' },
    { name: 'Minha Lista', icon: Bookmark, path: '/dashboard/favorites' },
    { name: 'TV ao vivo', icon: Tv, path: '/dashboard/live' },
    { name: 'Filmes', icon: Film, path: '/dashboard/movies' },
    { name: 'Séries', icon: Layers, path: '/dashboard/series' },
    { name: 'Modo TV', icon: Radio, path: '/dashboard/tv' },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { logout } = useAuth();
    const { syncData, isSyncing, syncProgress, lastSync } = useData();
    const { activeProfile } = useProfile();
    const [showProfiles, setShowProfiles] = useState(false);
    // Per-device "broadcast everything" preference — lazy init, no setState in effect.
    const [autoBroadcast, setAutoBroadcastOn] = useState(() => getAutoBroadcast());

    const toggleAutoBroadcast = () => {
        const next = !autoBroadcast;
        setAutoBroadcast(next);
        setAutoBroadcastOn(next);
    };

    return (
        <aside className="hidden md:flex w-20 lg:w-72 h-full bg-black/60  border-r border-white/10 flex flex-col transition-all duration-300 relative z-50">

            {/* Profile chip — Netflix-style, at the top. */}
            <div className="px-2 lg:px-3 pt-4">
                <button
                    onClick={() => setShowProfiles(true)}
                    data-focusable="true"
                    tabIndex={0}
                    title="Trocar perfil"
                    className="w-full flex items-center space-x-3 rounded-lg px-2 lg:px-3 py-1.5 hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-red-600 justify-start"
                >
                    <span className="w-8 h-8 flex-shrink-0 rounded-md bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center text-white text-xs font-bold uppercase">
                        {activeProfile?.name?.charAt(0) ?? <User size={16} />}
                    </span>
                    <span className="hidden lg:block flex-1 min-w-0 text-left text-sm font-semibold text-white truncate">
                        {activeProfile?.name ?? 'Perfil'}
                    </span>
                    <ChevronDown size={14} className="hidden lg:block text-gray-500 flex-shrink-0" />
                </button>
            </div>

            <nav className="mt-6 pt-6 space-y-0.5 px-2 lg:px-3 overflow-y-auto border-t border-white/5">
                {menuItems.map((item) => {
                    // '/dashboard' is a prefix of every route, so it only matches exactly.
                    const isActive = item.path === '/dashboard'
                        ? pathname === item.path
                        : pathname.startsWith(item.path);
                    const Icon = item.icon;
                    // Sky accent marks the TV-sharing family (Modo TV + "Transmitir tudo").
                    const isTvShare = item.path === '/dashboard/tv';

                    return (
                        <Link
                            key={item.path}
                            href={item.path}
                            data-focusable="true"
                            tabIndex={0}
                            className={`flex items-center space-x-3 px-2 lg:px-3 py-1.5 rounded-lg transition-all duration-300 group relative overflow-hidden focus:outline-none focus:ring-2 focus:ring-red-600 justify-start ${isActive
                                ? 'bg-red-600/10 text-red-500 shadow-[0_0_20px_rgba(229,9,20,0.15)]'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            {isActive && (
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-600 rounded-r-full shadow-[0_0_10px_#e50914]"></div>
                            )}

                            <Icon size={18} className={`flex-shrink-0 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'} ${!isActive && isTvShare ? 'text-sky-400' : ''}`} />
                            <span className="hidden lg:block text-sm font-medium tracking-wide">{item.name}</span>
                        </Link>
                    );
                })}
            </nav>

            {/* Auto-broadcast toggle — shares the sky accent with "Modo TV" above, since it
                feeds that same screen: whatever this device opens becomes watchable there. */}
            <div className="flex-1 mt-6 pt-6 px-2 lg:px-3 border-t border-white/5">
                <button
                    onClick={toggleAutoBroadcast}
                    data-focusable="true"
                    tabIndex={0}
                    title="Transmitir sempre"
                    aria-pressed={autoBroadcast}
                    className={`w-full flex items-center space-x-3 rounded-lg border-l-2 px-2 lg:px-3 py-1.5 text-left transition-all focus:outline-none focus:ring-2 focus:ring-sky-500 justify-start ${autoBroadcast ? 'border-sky-400 bg-sky-400/10' : 'border-sky-400/30 hover:bg-white/5'}`}
                >
                    <Radio size={18} className={`flex-shrink-0 ${autoBroadcast ? 'text-sky-400 animate-pulse' : 'text-sky-400/60'}`} />
                    <span className="hidden lg:flex flex-1 flex-col items-start min-w-0">
                        <span className="text-sm font-medium text-white leading-tight">Transmitir sempre</span>
                        <span className="text-[10px] text-gray-400 leading-tight">Tudo que abrir entra no Modo TV</span>
                    </span>
                    <span className={`hidden lg:inline-flex relative h-4 w-8 flex-shrink-0 items-center rounded-full transition-colors ${autoBroadcast ? 'bg-sky-500' : 'bg-white/20'}`}>
                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${autoBroadcast ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </span>
                </button>
            </div>

            <div className="mt-6 px-2 lg:px-3 py-3 space-y-0.5 border-t border-white/5">
                <button
                    onClick={syncData}
                    disabled={isSyncing}
                    data-focusable="true"
                    tabIndex={0}
                    className="w-full flex items-center space-x-3 px-2 lg:px-3 py-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all duration-300 group focus:outline-none focus:ring-2 focus:ring-red-600 relative overflow-hidden justify-start"
                >
                    <RefreshCw size={18} className={`flex-shrink-0 group-hover:rotate-180 transition-transform duration-700 ${isSyncing ? 'animate-spin text-red-500' : ''}`} />
                    <div className="hidden lg:flex flex-col items-start min-w-0">
                        <span className="text-sm font-medium">{isSyncing ? 'Sincronizando...' : 'Atualizar catálogo'}</span>
                        {isSyncing ? (
                            <span className="text-[10px] text-gray-500">{syncProgress}% concluído</span>
                        ) : lastSync && (
                            <span className="text-[10px] text-gray-500">
                                Atualizado em {new Date(lastSync).toLocaleDateString()}
                            </span>
                        )}
                    </div>
                </button>

                <button
                    onClick={logout}
                    data-focusable="true"
                    tabIndex={0}
                    className="w-full flex items-center space-x-3 px-2 lg:px-3 py-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all duration-300 group focus:outline-none focus:ring-2 focus:ring-red-600 justify-start"
                >
                    <LogOut size={18} className="group-hover:-translate-x-1 transition-transform" />
                    <span className="hidden lg:block text-sm font-medium">Sair</span>
                </button>
            </div>

            <ProfileModal
                isOpen={showProfiles}
                onClose={() => setShowProfiles(false)}
            />
        </aside>
    );
}
