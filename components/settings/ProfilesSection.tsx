'use client';

import { useState } from 'react';
import { useProfile } from '@/app/context/ProfileContext';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import Field, { inputClassName } from '@/components/ui/Field';
import Badge from '@/components/ui/Badge';
import SectionHeader from '@/components/ui/SectionHeader';
import { Pencil, Trash2, Plus, User } from 'lucide-react';

/** Profile management, inline (the logic behind ProfileModal, without the modal). */
export default function ProfilesSection() {
    const { profiles, activeProfile, selectProfile, createProfile, renameProfile, deleteProfile } = useProfile();
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [error, setError] = useState<string | null>(null);

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

    const startRename = (id: string, name: string) => {
        setEditingId(id);
        setEditingName(name);
    };

    const commitRename = async (id: string) => {
        const trimmed = editingName.trim();
        setEditingId(null);
        if (!trimmed) return;

        try {
            await renameProfile(id, trimmed);
            setError(null);
        } catch {
            setError('Não foi possível renomear o perfil.');
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Excluir o perfil "${name}"? A Minha Lista e o progresso dele serão apagados.`)) return;
        const failure = await deleteProfile(id);
        setError(failure);
    };

    return (
        <div>
            <SectionHeader title="Perfis" />
            <div className="space-y-2 mb-4">
                {profiles.map((profile) => {
                    const isActive = profile.id === activeProfile?.id;

                    return (
                        <div
                            key={profile.id}
                            className="flex items-center px-3 py-2.5 rounded-lg border border-line bg-surface"
                        >
                            <span className="w-9 h-9 flex-shrink-0 rounded-lg bg-surface-2 flex items-center justify-center mr-3">
                                <User size={18} className="text-ink-2" />
                            </span>

                            {editingId === profile.id ? (
                                <input
                                    autoFocus
                                    value={editingName}
                                    onChange={(e) => setEditingName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') commitRename(profile.id);
                                        if (e.key === 'Escape') setEditingId(null);
                                    }}
                                    onBlur={() => commitRename(profile.id)}
                                    data-focusable="true"
                                    tabIndex={0}
                                    className={`${inputClassName} h-9 flex-1`}
                                />
                            ) : (
                                <button
                                    onClick={() => selectProfile(profile.id)}
                                    data-focusable="true"
                                    tabIndex={0}
                                    className="flex-1 text-left text-sm text-ink truncate"
                                >
                                    {profile.name}
                                </button>
                            )}

                            {isActive && (
                                <span className="ml-2 flex-shrink-0">
                                    <Badge tone="ok">Ativo</Badge>
                                </span>
                            )}

                            <IconButton
                                icon={Pencil}
                                label={`Renomear ${profile.name}`}
                                size="sm"
                                onClick={() => startRename(profile.id, profile.name)}
                                className="ml-2 flex-shrink-0"
                            />

                            {profiles.length > 1 && (
                                <IconButton
                                    icon={Trash2}
                                    label={`Excluir ${profile.name}`}
                                    size="sm"
                                    onClick={() => handleDelete(profile.id, profile.name)}
                                    className="ml-1 flex-shrink-0"
                                />
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="flex items-end space-x-2">
                <div className="flex-1">
                    <Field label="Novo perfil" htmlFor="new-profile-name">
                        <input
                            id="new-profile-name"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                            placeholder="Nome do perfil"
                            data-focusable="true"
                            tabIndex={0}
                            className={inputClassName}
                        />
                    </Field>
                </div>
                <Button icon={Plus} onClick={handleCreate}>
                    Criar
                </Button>
            </div>

            {error && <p className="text-brand text-sm mt-3">{error}</p>}
        </div>
    );
}
