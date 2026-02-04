'use client';

import { useFavorites } from '@/app/context/FavoritesContext';
import { Heart, Play, Tv, Film, Layers, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function FavoritesPage() {
    const { favorites, removeFavorite } = useFavorites();

    const liveItems = favorites.filter(f => f.type === 'live');
    const movieItems = favorites.filter(f => f.type === 'movie');
    const seriesItems = favorites.filter(f => f.type === 'series');

    const renderSection = (title: string, items: any[], emptyMsg: string, icon: any) => (
        <div className="space-y-6">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                {icon}
                <h2 className="text-2xl font-bold text-white">{title}</h2>
                <span className="text-sm font-medium text-gray-400 bg-white/10 px-2 py-0.5 rounded-full">{items.length}</span>
            </div>

            {items.length === 0 ? (
                <div className="text-gray-500 italic py-8">{emptyMsg}</div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                    {items.map((item) => (
                        <div key={`${item.type}-${item.id}`} className="group relative bg-[#1f1f1f] rounded-xl overflow-hidden shadow-lg border border-white/5 hover:border-red-500/30 transition-all hover:-translate-y-1">
                            <Link href={`/dashboard/watch/${item.type}/${item.id}`} data-focusable="true" tabIndex={0} className="block focus:outline-none focus:ring-4 focus:ring-red-600 focus:scale-105 z-10 rounded-xl">
                                <div className="aspect-[2/3] relative">
                                    {item.image ? (
                                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-white/5 text-gray-600">
                                            <Heart size={40} />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                                        <Play className="text-white fill-current w-12 h-12 scale-0 group-hover:scale-110 transition-transform duration-300" />
                                    </div>
                                </div>
                            </Link>
                            <div className="p-4">
                                <h3 className="text-white font-medium truncate text-sm mb-2">{item.name}</h3>
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        removeFavorite(item.id, item.type);
                                    }}
                                    data-focusable="true"
                                    tabIndex={0}
                                    className="text-xs text-red-500 hover:text-red-400 flex items-center gap-1 transition-colors focus:outline-none focus:text-white focus:bg-red-600 px-2 py-1 rounded"
                                >
                                    <Heart size={12} fill="currentColor" /> Remover
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-12">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Meus Favoritos</h1>
                <p className="text-gray-400 text-sm md:text-base">Sua coleção personalizada de conteúdo.</p>
            </div>

            {favorites.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500 space-y-4">
                    <Heart size={64} className="opacity-20" />
                    <p className="text-xl">Você ainda não adicionou nenhum favorito.</p>
                    <Link href="/dashboard/search" className="text-red-500 hover:text-red-400 font-medium">
                        Explore o conteúdo para adicionar alguns!
                    </Link>
                </div>
            ) : (
                <>
                    {renderSection('Canais de TV ao Vivo', liveItems, 'Nenhum canal favorito.', <Tv className="text-red-500" />)}
                    {renderSection('Filmes', movieItems, 'Nenhum filme favorito.', <Film className="text-blue-500" />)}
                    {renderSection('Séries', seriesItems, 'Nenhuma série favorita.', <Layers className="text-purple-500" />)}
                </>
            )}
        </div>
    );
}
