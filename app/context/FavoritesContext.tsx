'use client';

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';

// Simplified Item for Favorites (storing just enough to render a card)
export interface FavoriteItem {
    id: string | number;
    type: 'live' | 'movie' | 'series';
    name: string;
    image?: string;
    rating?: string;
}

interface FavoritesState {
    favorites: FavoriteItem[];
    addFavorite: (item: FavoriteItem) => void;
    removeFavorite: (id: string | number, type: 'live' | 'movie' | 'series') => void;
    isFavorite: (id: string | number, type: 'live' | 'movie' | 'series') => boolean;
}

const FavoritesContext = createContext<FavoritesState | undefined>(undefined);

export const FavoritesProvider = ({ children }: { children: ReactNode }) => {
    const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);
    // Tracks whether `favorites` has been changed by the user (add/remove)
    // since the initial load, so the load itself doesn't trigger a redundant
    // POST right after the GET on every boot.
    const hasUserChangeRef = useRef(false);

    // Load from Backend on mount
    useEffect(() => {
        const loadFavorites = async () => {
            try {
                const res = await fetch('/api/favorites');
                if (res.ok) {
                    const data = await res.json();
                    setFavorites(data);
                }
            } catch (e) {
                console.error("Failed to fetch favorites from backend", e);
                // Fallback to localStorage if backend fails
                const stored = localStorage.getItem('xstream_favorites');
                if (stored) {
                    try {
                        setFavorites(JSON.parse(stored));
                    } catch (e) {
                        console.error("Failed to parse localStorage favorites", e);
                    }
                }
            } finally {
                setIsLoaded(true);
            }
        };
        loadFavorites();
    }, []);

    // The local cache must track whatever we last saw, including the list the
    // backend just handed us — otherwise the offline fallback in loadFavorites
    // would serve stale data forever.
    useEffect(() => {
        if (isLoaded) {
            localStorage.setItem('xstream_favorites', JSON.stringify(favorites));
        }
    }, [favorites, isLoaded]);

    // Writing back to the backend, on the other hand, is only warranted for
    // real user-driven add/remove changes: posting the list we just fetched
    // would be a redundant round trip on every boot.
    useEffect(() => {
        if (isLoaded && hasUserChangeRef.current) {
            const syncFavorites = async () => {
                try {
                    await fetch('/api/favorites', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(favorites)
                    });
                } catch (e) {
                    console.error("Failed to sync favorites to backend", e);
                }
            };
            syncFavorites();
        }
    }, [favorites, isLoaded]);

    const addFavorite = (item: FavoriteItem) => {
        hasUserChangeRef.current = true;
        setFavorites(prev => {
            if (prev.some(f => f.id === item.id && f.type === item.type)) return prev;
            return [...prev, item];
        });
    };

    const removeFavorite = (id: string | number, type: 'live' | 'movie' | 'series') => {
        hasUserChangeRef.current = true;
        setFavorites(prev => prev.filter(item => !(item.id === id && item.type === type)));
    };

    const isFavorite = (id: string | number, type: 'live' | 'movie' | 'series') => {
        return favorites.some(item => item.id == id && item.type === type); // weak equality for id (string/number)
    };

    return (
        <FavoritesContext.Provider value={{ favorites, addFavorite, removeFavorite, isFavorite }}>
            {children}
        </FavoritesContext.Provider>
    );
};

export const useFavorites = () => {
    const context = useContext(FavoritesContext);
    if (context === undefined) {
        throw new Error('useFavorites must be used within a FavoritesProvider');
    }
    return context;
};
