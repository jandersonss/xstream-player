'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { useProfile } from '@/app/context/ProfileContext';
import { useT } from '@/app/context/I18nContext';
import Modal from '@/components/ui/Modal';
import Field, { inputClassName } from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import Badge from '@/components/ui/Badge';

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
    const { profiles, activeProfile, selectProfile, createProfile, renameProfile, deleteProfile } = useProfile();
    const t = useT();
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    // Inline confirmation instead of the native browser confirm dialog: on webOS
    // it is not reachable by D-pad, which traps the TV the same way D1 (the old
    // LimitReachedModal) did.
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
            setError(t('profiles.createError'));
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
            setError(t('profiles.renameError'));
        }
    };

    const handleConfirmDelete = async (id: string) => {
        const failure = await deleteProfile(id);
        setDeletingId(null);
        setError(failure);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('profiles.title')} size="sm">
            <div className="space-y-2 mb-6">
                {profiles.map(profile => {
                    const isActive = profile.id === activeProfile?.id;
                    const isDeleting = deletingId === profile.id;

                    return (
                        <div
                            key={profile.id}
                            className={`rounded-xl border ${isActive ? 'bg-brand-soft border-brand' : 'bg-surface border-line'}`}
                        >
                            {isDeleting ? (
                                <div className="flex items-center justify-between px-3 py-2.5 space-x-3">
                                    <p className="text-sm text-ink flex-1">
                                        {t('profiles.deleteConfirm', { name: profile.name })}
                                    </p>
                                    <Button variant="ghost" size="sm" onClick={() => setDeletingId(null)}>
                                        {t('profiles.cancel')}
                                    </Button>
                                    <Button variant="danger" size="sm" onClick={() => void handleConfirmDelete(profile.id)}>
                                        {t('profiles.delete')}
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex items-center space-x-3 px-3 py-2.5">
                                    <div className="w-9 h-9 rounded-lg bg-surface-3 flex items-center justify-center shrink-0">
                                        <span className="text-ink font-semibold text-sm">
                                            {profile.name.charAt(0).toUpperCase()}
                                        </span>
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
                                            tabIndex={0}
                                            className={`flex-1 ${inputClassName} h-9`}
                                        />
                                    ) : (
                                        <button
                                            onClick={() => selectProfile(profile.id)}
                                            data-focusable="true"
                                            data-profile-select={profile.id}
                                            tabIndex={0}
                                            className="flex-1 text-left text-sm font-medium text-ink"
                                        >
                                            {profile.name}
                                        </button>
                                    )}

                                    {isActive && <Badge tone="ok">{t('profiles.active')}</Badge>}

                                    <IconButton
                                        icon={Pencil}
                                        label={t('profiles.renameLabel', { name: profile.name })}
                                        onClick={() => {
                                            setEditingId(profile.id);
                                            setEditingName(profile.name);
                                        }}
                                    />

                                    {profiles.length > 1 && (
                                        <IconButton
                                            icon={Trash2}
                                            label={t('profiles.deleteLabel', { name: profile.name })}
                                            onClick={() => setDeletingId(profile.id)}
                                        />
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="flex items-end space-x-2">
                <Field label={t('profiles.newProfile')}>
                    <input
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleCreate()}
                        placeholder={t('profiles.namePlaceholder')}
                        data-focusable="true"
                        tabIndex={0}
                        className={inputClassName}
                    />
                </Field>
                <Button variant="primary" icon={Plus} onClick={handleCreate}>
                    {t('profiles.create')}
                </Button>
            </div>

            {error && <p className="text-brand text-sm mt-4">{error}</p>}
        </Modal>
    );
}
