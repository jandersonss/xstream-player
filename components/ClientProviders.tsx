'use client';

import TvNavigationProvider from '@/components/TvNavigationProvider';
import { AuthProvider } from '../app/context/AuthContext';
import { FavoritesProvider } from '../app/context/FavoritesContext';

import { DataProvider } from '../app/context/DataContext';
import { WatchProgressProvider } from '../app/context/WatchProgressContext';

export function ClientProviders({ children }: { children: React.ReactNode }) {
    return (
        <AuthProvider>
            <DataProvider>
                <FavoritesProvider>
                    <WatchProgressProvider>
                        <TvNavigationProvider>
                            {children}
                        </TvNavigationProvider>
                    </WatchProgressProvider>
                </FavoritesProvider>
            </DataProvider>
        </AuthProvider>
    );
}
