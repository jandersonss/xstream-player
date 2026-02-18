'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Tv, Film, Layers, LogOut, Search, Heart, RefreshCw, Subtitles } from 'lucide-react';
import { useAuth } from '../app/context/AuthContext';
import { useData } from '../app/context/DataContext';
import SubtitleSettingsModal from './SubtitleSettingsModal';

const menuItems = [
    { name: 'Início', icon: Home, path: '/dashboard' },
    { name: 'Pesquisar', icon: Search, path: '/dashboard/search' },
    { name: 'Favoritos', icon: Heart, path: '/dashboard/favorites' },
    { name: 'TV ao Vivo', icon: Tv, path: '/dashboard/live' },
    { name: 'Filmes', icon: Film, path: '/dashboard/movies' },
    { name: 'Séries', icon: Layers, path: '/dashboard/series' },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { logout } = useAuth();
    const { syncData, isSyncing, syncProgress, lastSync } = useData();
    const [showSubtitleSettings, setShowSubtitleSettings] = useState(false);

    return (
        <aside className="hidden md:flex w-20 lg:w-72 h-full bg-black/60 backdrop-blur-xl border-r border-white/10 flex flex-col transition-all duration-300 relative z-50">

            {/* Logo Area */}
            <div className="h-24 flex items-center px-2 lg:px-8 border-b border-white/5 justify-center lg:justify-start">
                <div className="w-10 h-10 bg-gradient-to-br from-red-600 to-red-900 rounded-xl flex items-center justify-center shadow-lg shadow-red-900/30">
                    <span className="font-bold text-white text-xl">X</span>
                </div>
                <div className="flex flex-col ml-0 lg:ml-4 overflow-hidden">
                    <span className="text-xl font-bold text-white hidden lg:block tracking-tight">
                        XStream
                    </span>
                    {lastSync && (
                        <span className="text-[10px] text-gray-500 hidden lg:block uppercase tracking-tighter">
                            Sincronizado em: {new Date(lastSync).toLocaleDateString()}
                        </span>
                    )}
                </div>
            </div>

            <nav className="flex-1 py-8 space-y-2 px-2 lg:px-4 overflow-y-auto">
                {menuItems.map((item) => {
                    const isActive = pathname.startsWith(item.path);
                    const Icon = item.icon;

                    return (
                        <Link
                            key={item.path}
                            href={item.path}
                            data-focusable="true"
                            tabIndex={0}
                            className={`flex items-center gap-0 lg:gap-4 px-2 lg:px-4 py-4 rounded-xl transition-all duration-300 group relative overflow-hidden focus:outline-none focus:ring-2 focus:ring-red-600 justify-center lg:justify-start ${isActive
                                ? 'bg-red-600/10 text-red-500 shadow-[0_0_20px_rgba(229,9,20,0.15)]'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            {isActive && (
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-600 rounded-r-full shadow-[0_0_10px_#e50914]"></div>
                            )}

                            <Icon size={24} className={`transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                            <span className="hidden lg:block font-medium tracking-wide">{item.name}</span>
                        </Link>
                    );
                })}
            </nav>

            <div className="p-2 lg:p-6 space-y-4 border-t border-white/5">
                <button
                    onClick={() => setShowSubtitleSettings(true)}
                    data-focusable="true"
                    tabIndex={0}
                    className="w-full flex items-center gap-0 lg:gap-4 px-2 lg:px-4 py-4 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all duration-300 group focus:outline-none focus:ring-2 focus:ring-emerald-600 justify-center lg:justify-start"
                >
                    <Subtitles size={24} className="group-hover:scale-110 transition-transform duration-300" />
                    <span className="hidden lg:block font-medium">Legendas</span>
                </button>

                <button
                    onClick={syncData}
                    disabled={isSyncing}
                    data-focusable="true"
                    tabIndex={0}
                    className="w-full flex items-center gap-0 lg:gap-4 px-2 lg:px-4 py-4 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all duration-300 group focus:outline-none focus:ring-2 focus:ring-red-600 relative overflow-hidden justify-center lg:justify-start"
                >
                    <RefreshCw size={24} className={`group-hover:rotate-180 transition-transform duration-700 ${isSyncing ? 'animate-spin text-red-500' : ''}`} />
                    <div className="hidden lg:flex flex-col items-start min-w-5">
                        <span className="font-medium">{isSyncing ? 'Sincronizando...' : 'Sincronizar Dados'}</span>
                        {isSyncing && (
                            <span className="text-[10px] text-gray-500">{syncProgress}% concluído</span>
                        )}
                    </div>
                </button>

                <button
                    onClick={logout}
                    data-focusable="true"
                    tabIndex={0}
                    className="w-full flex items-center gap-0 lg:gap-4 px-2 lg:px-4 py-4 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all duration-300 group focus:outline-none focus:ring-2 focus:ring-red-600 justify-center lg:justify-start"
                >
                    <LogOut size={24} className="group-hover:-translate-x-1 transition-transform" />
                    <span className="hidden lg:block font-medium">Sair</span>
                </button>
            </div>

            <SubtitleSettingsModal
                isOpen={showSubtitleSettings}
                onClose={() => setShowSubtitleSettings(false)}
            />
        </aside>
    );
}
