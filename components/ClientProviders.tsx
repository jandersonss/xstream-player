'use client';

import TvNavigationProvider from '@/components/TvNavigationProvider';
import { AuthProvider } from '../app/context/AuthContext';
import { FavoritesProvider } from '../app/context/FavoritesContext';

import { DataProvider } from '../app/context/DataContext';
import { WatchProgressProvider } from '../app/context/WatchProgressContext';
import { TMDbProvider } from '../app/context/TMDbContext';
import { SubtitleProvider } from '../app/context/SubtitleContext';

export function ClientProviders({ children }: { children: React.ReactNode }) {
    return (
        <AuthProvider>
            <DataProvider>
                <FavoritesProvider>
                    <WatchProgressProvider>
                        <TMDbProvider>
                            <SubtitleProvider>
                                <TvNavigationProvider>
                                    {children}
                                </TvNavigationProvider>
                            </SubtitleProvider>
                        </TMDbProvider>
                    </WatchProgressProvider>
                </FavoritesProvider>
            </DataProvider>
        </AuthProvider>
    );
}
