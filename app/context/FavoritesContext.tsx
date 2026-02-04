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

    // Load from LocalStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem('xstream_favorites');
        if (stored) {
            try {
                setFavorites(JSON.parse(stored));
            } catch (e) {
                console.error("Failed to parse favorites", e);
            }
        }
        setIsLoaded(true);
    }, []);

    // Save to LocalStorage whenever favorites change
    useEffect(() => {
        if (isLoaded) {
            localStorage.setItem('xstream_favorites', JSON.stringify(favorites));
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
