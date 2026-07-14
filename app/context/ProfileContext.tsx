'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export interface ProfilePrefs {
    subtitleLanguage: string;
    subtitleFontSize: number;
}

export interface Profile {
    id: string;
    name: string;
    prefs: ProfilePrefs;
}

interface ProfileState {
    profiles: Profile[];
    activeProfile: Profile | null;
    isLoaded: boolean;
    /** True when this device never picked a profile and more than one exists. */
    needsSelection: boolean;
    selectProfile: (id: string) => void;
    createProfile: (name: string) => Promise<void>;
    renameProfile: (id: string, name: string) => Promise<void>;
    deleteProfile: (id: string) => Promise<string | null>;
    updatePrefs: (prefs: Partial<ProfilePrefs>) => Promise<void>;
}

const ProfileContext = createContext<ProfileState | undefined>(undefined);

export const PROFILE_COOKIE_NAME = 'xstream_profile';

// The API routes read the active profile from this cookie, so every request
// already carries it — no client code needs to pass a profile id around.
function writeProfileCookie(id: string) {
    const oneYear = 60 * 60 * 24 * 365;
    document.cookie = `${PROFILE_COOKIE_NAME}=${id}; path=/; max-age=${oneYear}; SameSite=Lax`;
}

function readProfileCookie(): string | null {
    const match = document.cookie.match(new RegExp(`(?:^|; )${PROFILE_COOKIE_NAME}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
}

export const ProfileProvider = ({ children }: { children: ReactNode }) => {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [hasPicked, setHasPicked] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch('/api/profiles');
                if (res.ok) {
                    const { data } = await res.json() as { data: Profile[] };
                    setProfiles(data);

                    const cookieId = readProfileCookie();
                    const picked = data.find(p => p.id === cookieId) ?? null;

                    // Without a cookie the server falls back to the first profile,
                    // so the client has to fall back to the same one to stay in sync.
                    setActiveId((picked ?? data[0])?.id ?? null);
                    setHasPicked(picked !== null);
                }
            } catch (e) {
                console.error('[Profiles] Failed to load profiles', e);
            } finally {
                setIsLoaded(true);
            }
        };
        load();
    }, []);

    const selectProfile = useCallback((id: string) => {
        writeProfileCookie(id);
        setActiveId(id);
        setHasPicked(true);
    }, []);

    const createProfile = useCallback(async (name: string) => {
        const res = await fetch('/api/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', name })
        });
        if (!res.ok) throw new Error('Falha ao criar perfil');
        const { data } = await res.json() as { data: Profile };
        setProfiles(prev => [...prev, data]);
    }, []);

    const renameProfile = useCallback(async (id: string, name: string) => {
        const res = await fetch('/api/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update', id, name })
        });
        if (!res.ok) throw new Error('Falha ao renomear perfil');
        const { data } = await res.json() as { data: Profile };
        setProfiles(prev => prev.map(p => (p.id === id ? data : p)));
    }, []);

    const deleteProfile = useCallback(async (id: string): Promise<string | null> => {
        const res = await fetch('/api/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', id })
        });
        if (!res.ok) {
            const { error } = await res.json() as { error?: string };
            return error ?? 'Falha ao excluir perfil';
        }

        const remaining = profiles.filter(p => p.id !== id);
        setProfiles(remaining);
        if (activeId === id && remaining[0]) {
            selectProfile(remaining[0].id);
        }
        return null;
    }, [profiles, activeId, selectProfile]);

    const updatePrefs = useCallback(async (prefs: Partial<ProfilePrefs>) => {
        if (!activeId) return;

        // Optimistic: preference changes come from UI controls (font size steps,
        // language picker) that must feel immediate.
        setProfiles(prev => prev.map(p => (
            p.id === activeId ? { ...p, prefs: { ...p.prefs, ...prefs } } : p
        )));

        try {
            await fetch('/api/profiles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'update', id: activeId, prefs })
            });
        } catch (e) {
            console.error('[Profiles] Failed to save preferences', e);
        }
    }, [activeId]);

    const activeProfile = profiles.find(p => p.id === activeId) ?? null;
    const needsSelection = isLoaded && !hasPicked && profiles.length > 1;

    return (
        <ProfileContext.Provider value={{
            profiles,
            activeProfile,
            isLoaded,
            needsSelection,
            selectProfile,
            createProfile,
            renameProfile,
            deleteProfile,
            updatePrefs
        }}>
            {children}
        </ProfileContext.Provider>
    );
};

export const useProfile = () => {
    const context = useContext(ProfileContext);
    if (context === undefined) {
        throw new Error('useProfile must be used within a ProfileProvider');
    }
    return context;
};
