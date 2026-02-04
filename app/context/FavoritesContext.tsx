'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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

    // Save to Backend whenever favorites change
    useEffect(() => {
        if (isLoaded) {
            // Update localStorage as a local cache/backup
            localStorage.setItem('xstream_favorites', JSON.stringify(favorites));

            // Sync with backend
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
        setFavorites(prev => {
            if (prev.some(f => f.id === item.id && f.type === item.type)) return prev;
            return [...prev, item];
        });
    };

    const removeFavorite = (id: string | number, type: 'live' | 'movie' | 'series') => {
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
