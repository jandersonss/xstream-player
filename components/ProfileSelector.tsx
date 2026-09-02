'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useProfile } from '@/app/context/ProfileContext';
import { inputClassName } from '@/components/ui/Field';

/**
 * Full-screen picker shown when a device has never chosen a profile and more
 * than one exists. Choosing writes the cookie, so it only appears once per device.
 *
 * This is a gate, not a dialog: it takes over the whole screen instead of using
 * `components/ui/Modal.tsx`, and there is no way to dismiss it without picking.
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
            // Deliberately not auto-selected: the user still has to choose a profile
            // to watch as, even the one they just created.
            setName('');
            setIsCreating(false);
            setError(null);
        } catch {
            setError('Não foi possível criar o perfil.');
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-bg flex flex-col items-center justify-center p-6">
            <h1 className="text-2xl md:text-4xl font-semibold text-ink mb-10">Quem está assistindo?</h1>

            {/* Flexbox gap spacing needs Chrome 84+ (WebOS TVs lack it): child m-3 plus a
                negative margin on the container reproduces the same 24px spacing. */}
            <div className="flex flex-wrap justify-center -m-3 max-w-4xl">
                {profiles.map(profile => (
                    <button
                        key={profile.id}
                        onClick={() => selectProfile(profile.id)}
                        data-focusable="true"
                        tabIndex={0}
                        className="focus-lift-lg m-3 flex flex-col items-center space-y-3"
                    >
                        <div className="w-24 h-24 md:w-32 md:h-32 rounded-xl bg-surface-2 flex items-center justify-center">
                            <span className="text-3xl md:text-4xl font-semibold text-ink">
                                {profile.name.charAt(0).toUpperCase()}
                            </span>
                        </div>
                        <span className="text-ink-2 text-sm md:text-base font-medium">
                            {profile.name}
                        </span>
                    </button>
                ))}

                {isCreating ? (
                    <div className="m-3 flex flex-col items-center space-y-3">
                        <div className="w-24 h-24 md:w-32 md:h-32 rounded-xl bg-surface-2 border border-line flex items-center justify-center">
                            <Plus size={40} className="text-ink-3" />
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
                            className={`${inputClassName} w-32 text-center`}
                        />
                    </div>
                ) : (
                    <button
                        onClick={() => setIsCreating(true)}
                        data-focusable="true"
                        tabIndex={0}
                        className="focus-lift-lg m-3 flex flex-col items-center space-y-3"
                    >
                        <div className="w-24 h-24 md:w-32 md:h-32 rounded-xl bg-surface-2 border border-line flex items-center justify-center">
                            <Plus size={40} className="text-ink-3" />
                        </div>
                        <span className="text-ink-2 text-sm md:text-base font-medium">
                            Adicionar perfil
                        </span>
                    </button>
                )}
            </div>

            {error && <p className="text-brand text-sm mt-6">{error}</p>}
        </div>
    );
}
