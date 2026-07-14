'use client';

import { useState } from 'react';
import { Plus, User } from 'lucide-react';
import { useProfile } from '@/app/context/ProfileContext';

/**
 * Full-screen picker shown when a device has never chosen a profile and more
 * than one exists. Choosing writes the cookie, so it only appears once per device.
 */
export default function ProfileSelector() {
    const { profiles, selectProfile, createProfile } = useProfile();
    const [isCreating, setIsCreating] = useState(false);
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleCreate = async () => {
        const trimmed = name.trim();
        if (!trimmed) return;

        try {
            await createProfile(trimmed);
            setName('');
            setIsCreating(false);
            setError(null);
        } catch {
            setError('Não foi possível criar o perfil.');
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-6">
            <h1 className="text-3xl lg:text-4xl font-bold text-white mb-10">Quem está assistindo?</h1>

            <div className="flex flex-wrap justify-center gap-6 max-w-4xl">
                {profiles.map(profile => (
                    <button
                        key={profile.id}
                        onClick={() => selectProfile(profile.id)}
                        data-focusable="true"
                        tabIndex={0}
                        className="group flex flex-col items-center gap-3 focus:outline-none"
                    >
                        <div className="w-24 h-24 lg:w-32 lg:h-32 rounded-2xl bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center ring-2 ring-transparent group-hover:ring-white group-focus:ring-white transition-all">
                            <User size={48} className="text-white" />
                        </div>
                        <span className="text-gray-400 group-hover:text-white group-focus:text-white text-sm font-medium transition-colors">
                            {profile.name}
                        </span>
                    </button>
                ))}

                {isCreating ? (
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-24 h-24 lg:w-32 lg:h-32 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                            <User size={48} className="text-gray-600" />
                        </div>
                        <input
                            autoFocus
                            value={name}
                            onChange={e => setName(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleCreate();
                                if (e.key === 'Escape') setIsCreating(false);
                            }}
                            placeholder="Nome do perfil"
                            data-focusable="true"
                            className="w-32 bg-white/10 text-white text-sm text-center rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-600"
                        />
                    </div>
                ) : (
                    <button
                        onClick={() => setIsCreating(true)}
                        data-focusable="true"
                        tabIndex={0}
                        className="group flex flex-col items-center gap-3 focus:outline-none"
                    >
                        <div className="w-24 h-24 lg:w-32 lg:h-32 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 group-focus:ring-2 group-focus:ring-white transition-all">
                            <Plus size={48} className="text-gray-500 group-hover:text-white transition-colors" />
                        </div>
                        <span className="text-gray-500 group-hover:text-white text-sm font-medium transition-colors">
                            Adicionar perfil
                        </span>
                    </button>
                )}
            </div>

            {error && <p className="text-red-500 text-sm mt-6">{error}</p>}
        </div>
    );
}
