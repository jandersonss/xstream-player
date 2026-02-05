'use client';

import TvNavigationProvider from '@/components/TvNavigationProvider';
import { AuthProvider } from '../app/context/AuthContext';
import { FavoritesProvider } from '../app/context/FavoritesContext';

import { DataProvider } from '../app/context/DataContext';
import { WatchProgressProvider } from '../app/context/WatchProgressContext';
import { TMDbProvider } from '../app/context/TMDbContext';

export function ClientProviders({ children }: { children: React.ReactNode }) {
    return (
        <AuthProvider>
            <DataProvider>
                <FavoritesProvider>
                    <WatchProgressProvider>
                        <TMDbProvider>
                            <TvNavigationProvider>
                                {children}
                            </TvNavigationProvider>
                        </TMDbProvider>
                    </WatchProgressProvider>
                </FavoritesProvider>
            </DataProvider>
        </AuthProvider>
    );
}
