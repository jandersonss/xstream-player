'use client';

import TvNavigationProvider from '@/components/TvNavigationProvider';
import { AuthProvider } from '../app/context/AuthContext';
import { FavoritesProvider } from '../app/context/FavoritesContext';

import { DataProvider } from '../app/context/DataContext';

export function ClientProviders({ children }: { children: React.ReactNode }) {
    return (
        <AuthProvider>
            <DataProvider>
                <FavoritesProvider>
                    <TvNavigationProvider>
                        {children}
                    </TvNavigationProvider>
                </FavoritesProvider>
            </DataProvider>
        </AuthProvider>
    );
}
