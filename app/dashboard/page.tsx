'use client';

import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import Link from 'next/link';
import { Tv, Film, Layers, Clock, Calendar, User } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function Dashboard() {
    const { user, server } = useAuth();
    const { lastSync } = useData();
    const [greeting, setGreeting] = useState('Welcome back');

    useEffect(() => {
        const hour = new Date().getHours();
        if (hour < 12) setGreeting('Bom dia');
        else if (hour < 18) setGreeting('Boa tarde');
        else setGreeting('Boa noite');
    }, []);

    const formatDate = (timestamp: string) => {
        if (!timestamp) return 'Ilimitado';
        const date = new Date(parseInt(timestamp) * 1000);
        return date.toLocaleDateString();
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl md:text-4xl font-bold text-white mb-2">{greeting}, {user?.username}</h1>
                    <div className="flex items-center gap-2">
                        <p className="text-gray-400 text-sm md:text-base">O que você gostaria de assistir hoje?</p>
                        {lastSync && (
                            <span className="text-[10px] bg-white/5 border border-white/10 px-2 py-0.5 rounded text-gray-500 uppercase tracking-widest hidden md:inline-block">
                                Banco de dados sincronizado: {new Date(lastSync).toLocaleDateString()}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex gap-4">
                    <div className="bg-[#1f1f1f] px-4 py-2 rounded-lg border border-[#333] flex items-center gap-2">
                        <User size={16} className="text-red-500" />
                        <span className="text-sm font-medium text-gray-300">{user?.status === 'Active' ? 'Assinatura Ativa' : user?.status}</span>
                    </div>
                    <div className="bg-[#1f1f1f] px-4 py-2 rounded-lg border border-[#333] flex items-center gap-2">
                        <Calendar size={16} className="text-red-500" />
                        <span className="text-sm font-medium text-gray-300">Exp: {user?.exp_date ? formatDate(user.exp_date) : 'N/A'}</span>
                    </div>
                </div>
            </div>

            {/* Main Categories Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Link
                    href="/dashboard/live"
                    data-focusable="true"
                    tabIndex={0}
                    autoFocus
                    className="group relative h-64 rounded-2xl overflow-hidden cursor-pointer border border-[#333] hover:border-red-600 transition-all shadow-xl hover:shadow-red-900/20 focus:outline-none focus:ring-4 focus:ring-red-600 focus:scale-105 z-10"
                >
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent z-10"></div>
                    <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center transition-transform duration-700 group-hover:scale-110"></div>

                    <div className="absolute bottom-0 left-0 p-6 z-20 w-full">
                        <div className="flex items-center justify-between mb-2">
                            <div className="p-3 bg-red-600 rounded-full group-hover:scale-110 transition-transform">
                                <Tv size={24} className="text-white" />
                            </div>
                            <span className="text-xs font-bold bg-white/20 backdrop-blur-md px-2 py-1 rounded text-white uppercase tracking-wider">Transmissão ao Vivo</span>
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-1">TV ao Vivo</h3>
                        <p className="text-gray-300 text-sm line-clamp-1">Assista seus canais favoritos ao vivo.</p>
                    </div>
                </Link>

                <Link
                    href="/dashboard/movies"
                    data-focusable="true"
                    tabIndex={0}
                    className="group relative h-64 rounded-2xl overflow-hidden cursor-pointer border border-[#333] hover:border-red-600 transition-all shadow-xl hover:shadow-red-900/20 focus:outline-none focus:ring-4 focus:ring-red-600 focus:scale-105 z-10"
                >
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent z-10"></div>
                    <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=2525&auto=format&fit=crop')] bg-cover bg-center transition-transform duration-700 group-hover:scale-110"></div>

                    <div className="absolute bottom-0 left-0 p-6 z-20 w-full">
                        <div className="flex items-center justify-between mb-2">
                            <div className="p-3 bg-blue-600 rounded-full group-hover:scale-110 transition-transform">
                                <Film size={24} className="text-white" />
                            </div>
                            <span className="text-xs font-bold bg-white/20 backdrop-blur-md px-2 py-1 rounded text-white uppercase tracking-wider">On Demand</span>
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-1">Filmes</h3>
                        <p className="text-gray-300 text-sm line-clamp-1">Últimos lançamentos e clássicos.</p>
                    </div>
                </Link>

                <Link
                    href="/dashboard/series"
                    data-focusable="true"
                    tabIndex={0}
                    className="group relative h-64 rounded-2xl overflow-hidden cursor-pointer border border-[#333] hover:border-red-600 transition-all shadow-xl hover:shadow-red-900/20 focus:outline-none focus:ring-4 focus:ring-red-600 focus:scale-105 z-10"
                >
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent z-10"></div>
                    <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?q=80&w=2669&auto=format&fit=crop')] bg-cover bg-center transition-transform duration-700 group-hover:scale-110"></div>

                    <div className="absolute bottom-0 left-0 p-6 z-20 w-full">
                        <div className="flex items-center justify-between mb-2">
                            <div className="p-3 bg-purple-600 rounded-full group-hover:scale-110 transition-transform">
                                <Layers size={24} className="text-white" />
                            </div>
                            <span className="text-xs font-bold bg-white/20 backdrop-blur-md px-2 py-1 rounded text-white uppercase tracking-wider">Maratonar</span>
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-1">Séries</h3>
                        <p className="text-gray-300 text-sm line-clamp-1">Programas de TV e episódios.</p>
                    </div>
                </Link>
            </div>

            {/* Account Details */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-[#1a1a1a] rounded-xl p-6 border border-[#333]">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Clock size={18} className="text-gray-400" />
                        Detalhes da Conta
                    </h3>
                    <div className="space-y-4">
                        <div className="flex justify-between border-b border-[#333] pb-2">
                            <span className="text-gray-400">Conexões Máximas</span>
                            <span className="text-white font-medium">{user?.max_connections}</span>
                        </div>
                        <div className="flex justify-between border-b border-[#333] pb-2">
                            <span className="text-gray-400">Conexões Ativas</span>
                            <span className="text-white font-medium">{user?.active_cons}</span>
                        </div>
                        <div className="flex justify-between border-b border-[#333] pb-2">
                            <span className="text-gray-400">URL</span>
                            <span className="text-white font-medium truncate max-w-[200px]">{server?.url}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-400">Fuso Horário</span>
                            <span className="text-white font-medium">{server?.timezone}</span>
                        </div>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-[#1a1a1a] to-[#222] rounded-xl p-6 border border-[#333] flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-[#333] rounded-full flex items-center justify-center mb-4">
                        <Tv size={32} className="text-gray-500" />
                    </div>
                    <h3 className="text-white font-bold mb-2">Comece a Assistir</h3>
                    <p className="text-gray-400 text-sm">Selecione uma categoria acima para começar a transmitir.</p>
                </div>
            </div>
        </div>
    );
}
