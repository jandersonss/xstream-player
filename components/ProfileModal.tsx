'use client';

import { useState } from 'react';
import { X, Plus, User, Check, Trash2, Pencil } from 'lucide-react';
import { useProfile } from '@/app/context/ProfileContext';

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
    const { profiles, activeProfile, selectProfile, createProfile, renameProfile, deleteProfile } = useProfile();
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleCreate = async () => {
        const trimmed = newName.trim();
        if (!trimmed) return;

        try {
            await createProfile(trimmed);
            setNewName('');
            setError(null);
        } catch {
            setError('Não foi possível criar o perfil.');
        }
    };

    const handleRename = async (id: string) => {
        const trimmed = editingName.trim();
        if (!trimmed) return;

        try {
            await renameProfile(id, trimmed);
            setEditingId(null);
            setError(null);
        } catch {
            setError('Não foi possível renomear o perfil.');
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Excluir o perfil "${name}"? Os favoritos e o progresso dele serão apagados.`)) return;

        const failure = await deleteProfile(id);
        setError(failure);
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="w-full max-w-md bg-neutral-900 border border-white/10 rounded-2xl p-6"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-white">Perfis</h2>
                    <button
                        onClick={onClose}
                        data-focusable="true"
                        tabIndex={0}
                        className="text-gray-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-600 rounded-lg p-1"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="space-y-2 mb-6">
                    {profiles.map(profile => {
                        const isActive = profile.id === activeProfile?.id;

                        return (
                            <div
                                key={profile.id}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                                    isActive
                                        ? 'bg-red-600/10 border-red-600/40'
                                        : 'bg-white/5 border-transparent hover:bg-white/10'
                                }`}
                            >
                                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center shrink-0">
                                    <User size={18} className="text-white" />
                                </div>

                                {editingId === profile.id ? (
                                    <input
                                        autoFocus
                                        value={editingName}
                                        onChange={e => setEditingName(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') handleRename(profile.id);
                                            if (e.key === 'Escape') setEditingId(null);
                                        }}
                                        onBlur={() => handleRename(profile.id)}
                                        data-focusable="true"
                                        className="flex-1 bg-black/40 text-white text-sm rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-red-600"
                                    />
                                ) : (
                                    <button
                                        onClick={() => selectProfile(profile.id)}
                                        data-focusable="true"
                                        tabIndex={0}
                                        className="flex-1 text-left text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-red-600 rounded-lg px-1 py-1"
                                    >
                                        {profile.name}
                                    </button>
                                )}

                                {isActive && <Check size={16} className="text-red-500 shrink-0" />}

                                <button
                                    onClick={() => {
                                        setEditingId(profile.id);
                                        setEditingName(profile.name);
                                    }}
                                    data-focusable="true"
                                    tabIndex={0}
                                    aria-label={`Renomear ${profile.name}`}
                                    className="text-gray-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-600 rounded-lg p-1 shrink-0"
                                >
                                    <Pencil size={15} />
                                </button>

                                {profiles.length > 1 && (
                                    <button
                                        onClick={() => handleDelete(profile.id, profile.name)}
                                        data-focusable="true"
                                        tabIndex={0}
                                        aria-label={`Excluir ${profile.name}`}
                                        className="text-gray-500 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-600 rounded-lg p-1 shrink-0"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="flex gap-2">
                    <input
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleCreate()}
                        placeholder="Novo perfil"
                        data-focusable="true"
                        className="flex-1 bg-white/5 text-white text-sm rounded-xl px-3 py-2.5 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-red-600"
                    />
                    <button
                        onClick={handleCreate}
                        data-focusable="true"
                        tabIndex={0}
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl focus:outline-none focus:ring-2 focus:ring-white transition-colors"
                    >
                        <Plus size={16} />
                        Criar
                    </button>
                </div>

                {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
            </div>
        </div>
    );
}
