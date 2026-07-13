'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Tv, Film, Layers, LogOut, Search, Heart, RefreshCw, Subtitles, Radio } from 'lucide-react';
import { useAuth } from '../app/context/AuthContext';
import { useData } from '../app/context/DataContext';
import { getAutoBroadcast, setAutoBroadcast } from '@/app/lib/device';
import SubtitleSettingsModal from './SubtitleSettingsModal';

const menuItems = [
    { name: 'Início', icon: Home, path: '/dashboard' },
    { name: 'Pesquisar', icon: Search, path: '/dashboard/search' },
    { name: 'Favoritos', icon: Heart, path: '/dashboard/favorites' },
    { name: 'TV ao Vivo', icon: Tv, path: '/dashboard/live' },
    { name: 'Modo TV', icon: Radio, path: '/dashboard/tv' },
    { name: 'Filmes', icon: Film, path: '/dashboard/movies' },
    { name: 'Séries', icon: Layers, path: '/dashboard/series' },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { logout } = useAuth();
    const { syncData, isSyncing, syncProgress, lastSync } = useData();
    const [showSubtitleSettings, setShowSubtitleSettings] = useState(false);
    // Per-device "broadcast everything" preference — lazy init, no setState in effect.
    const [autoBroadcast, setAutoBroadcastOn] = useState(() => getAutoBroadcast());

    const toggleAutoBroadcast = () => {
        const next = !autoBroadcast;
        setAutoBroadcast(next);
        setAutoBroadcastOn(next);
    };

    return (
        <aside className="hidden md:flex w-20 lg:w-72 h-full bg-black/60  border-r border-white/10 flex flex-col transition-all duration-300 relative z-50">

            {/* Logo Area */}
            <div className="h-20 flex items-center px-2 lg:px-8 border-b border-white/5 justify-center lg:justify-start">
                <div className="w-9 h-9 bg-gradient-to-br from-red-600 to-red-900 rounded-xl flex items-center justify-center shadow-lg shadow-red-900/30">
                    <span className="font-bold text-white text-lg">X</span>
                </div>
                <div className="flex flex-col ml-0 lg:ml-4 overflow-hidden">
                    <span className="text-lg font-bold text-white hidden lg:block tracking-tight">
                        XStream
                    </span>
                    {lastSync && (
                        <span className="text-[10px] text-gray-500 hidden lg:block uppercase tracking-tighter">
                            Sincronizado em: {new Date(lastSync).toLocaleDateString()}
                        </span>
                    )}
                </div>
            </div>

            {/* "Transmitir tudo" toggle — pinned to the top, collapses to just the icon in narrow mode. */}
            <div className="px-2 lg:px-4 pt-3">
                <button
                    onClick={toggleAutoBroadcast}
                    data-focusable="true"
                    tabIndex={0}
                    title="Transmitir tudo"
                    aria-pressed={autoBroadcast}
                    className={`w-full flex items-center gap-0 lg:gap-3 rounded-xl border px-2 lg:px-3 py-2.5 transition-all focus:outline-none focus:ring-2 focus:ring-red-500 justify-center lg:justify-start ${autoBroadcast ? 'border-red-500/50 bg-red-600/15' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                >
                    <Radio size={20} className={autoBroadcast ? 'text-red-400 animate-pulse' : 'text-gray-400'} />
                    <span className="hidden lg:flex flex-1 flex-col items-start min-w-0">
                        <span className="text-sm font-semibold text-white leading-tight">Transmitir tudo</span>
                        <span className="text-[10px] text-gray-400 leading-tight">
                            {autoBroadcast ? 'Todo conteúdo abre transmitindo' : 'Ligue para transmitir sempre'}
                        </span>
                    </span>
                    <span className={`hidden lg:inline-flex relative h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${autoBroadcast ? 'bg-red-600' : 'bg-white/20'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoBroadcast ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </span>
                </button>
            </div>

            <nav className="flex-1 py-4 space-y-1 px-2 lg:px-4 overflow-y-auto">
                {menuItems.map((item) => {
                    const isActive = pathname.startsWith(item.path);
                    const Icon = item.icon;

                    return (
                        <Link
                            key={item.path}
                            href={item.path}
                            data-focusable="true"
                            tabIndex={0}
                            className={`flex items-center gap-0 lg:gap-4 px-2 lg:px-4 py-2.5 rounded-xl transition-all duration-300 group relative overflow-hidden focus:outline-none focus:ring-2 focus:ring-red-600 justify-center lg:justify-start ${isActive
                                ? 'bg-red-600/10 text-red-500 shadow-[0_0_20px_rgba(229,9,20,0.15)]'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            {isActive && (
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-600 rounded-r-full shadow-[0_0_10px_#e50914]"></div>
                            )}

                            <Icon size={22} className={`transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                            <span className="hidden lg:block text-sm font-medium tracking-wide">{item.name}</span>
                        </Link>
                    );
                })}
            </nav>

            <div className="p-2 lg:p-4 space-y-2 border-t border-white/5">
                <button
                    onClick={() => setShowSubtitleSettings(true)}
                    data-focusable="true"
                    tabIndex={0}
                    className="w-full flex items-center gap-0 lg:gap-4 px-2 lg:px-4 py-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all duration-300 group focus:outline-none focus:ring-2 focus:ring-emerald-600 justify-center lg:justify-start"
                >
                    <Subtitles size={22} className="group-hover:scale-110 transition-transform duration-300" />
                    <span className="hidden lg:block text-sm font-medium">Legendas</span>
                </button>

                <button
                    onClick={syncData}
                    disabled={isSyncing}
                    data-focusable="true"
                    tabIndex={0}
                    className="w-full flex items-center gap-0 lg:gap-4 px-2 lg:px-4 py-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all duration-300 group focus:outline-none focus:ring-2 focus:ring-red-600 relative overflow-hidden justify-center lg:justify-start"
                >
                    <RefreshCw size={22} className={`group-hover:rotate-180 transition-transform duration-700 ${isSyncing ? 'animate-spin text-red-500' : ''}`} />
                    <div className="hidden lg:flex flex-col items-start min-w-5">
                        <span className="text-sm font-medium">{isSyncing ? 'Sincronizando...' : 'Sincronizar Dados'}</span>
                        {isSyncing && (
                            <span className="text-[10px] text-gray-500">{syncProgress}% concluído</span>
                        )}
                    </div>
                </button>

                <button
                    onClick={logout}
                    data-focusable="true"
                    tabIndex={0}
                    className="w-full flex items-center gap-0 lg:gap-4 px-2 lg:px-4 py-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all duration-300 group focus:outline-none focus:ring-2 focus:ring-red-600 justify-center lg:justify-start"
                >
                    <LogOut size={22} className="group-hover:-translate-x-1 transition-transform" />
                    <span className="hidden lg:block text-sm font-medium">Sair</span>
                </button>
            </div>

            <SubtitleSettingsModal
                isOpen={showSubtitleSettings}
                onClose={() => setShowSubtitleSettings(false)}
            />
        </aside>
    );
}
