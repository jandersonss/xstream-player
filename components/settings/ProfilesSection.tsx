'use client';

import { useEffect, useRef, useState } from 'react';
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
    // Inline confirmation instead of the native browser confirm dialog: on webOS
    // it is not reachable by D-pad, which traps the TV the same way D1 (the old
    // LimitReachedModal) did — mirrors ProfileModal.tsx.
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const prevEditingIdRef = useRef<string | null>(null);

    // The rename input unmounts back to the "select profile" button when
    // editing ends, dropping focus to `body` — the next D-pad press would
    // otherwise jump to the first focusable element on the whole page
    // (app/hooks/useTvNavigation.ts) instead of staying on this row.
    useEffect(() => {
        if (prevEditingIdRef.current && prevEditingIdRef.current !== editingId) {
            document
                .querySelector<HTMLElement>(`[data-profile-select="${prevEditingIdRef.current}"]`)
                ?.focus();
        }
        prevEditingIdRef.current = editingId;
    }, [editingId]);

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

    const handleConfirmDelete = async (id: string) => {
        const failure = await deleteProfile(id);
        setDeletingId(null);
        setError(failure);
    };

    return (
        <div>
            <SectionHeader title="Perfis" />
            <div className="space-y-2 mb-4">
                {profiles.map((profile) => {
                    const isActive = profile.id === activeProfile?.id;
                    const isDeleting = deletingId === profile.id;

                    if (isDeleting) {
                        return (
                            <div
                                key={profile.id}
                                className="flex items-center justify-between px-3 py-2.5 space-x-3 rounded-lg border border-line bg-surface"
                            >
                                <p className="text-sm text-ink flex-1">
                                    Excluir &quot;{profile.name}&quot;? A Minha Lista e o progresso serão apagados.
                                </p>
                                <Button variant="ghost" size="sm" onClick={() => setDeletingId(null)}>
                                    Cancelar
                                </Button>
                                <Button variant="danger" size="sm" onClick={() => void handleConfirmDelete(profile.id)}>
                                    Excluir
                                </Button>
                            </div>
                        );
                    }

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
                                    data-profile-select={profile.id}
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
                                    onClick={() => setDeletingId(profile.id)}
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
