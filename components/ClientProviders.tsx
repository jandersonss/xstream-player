'use client';

import { usePathname } from 'next/navigation';
import TvNavigationProvider from '@/components/TvNavigationProvider';
import { AuthProvider } from '../app/context/AuthContext';
import { FavoritesProvider } from '../app/context/FavoritesContext';

import { DataProvider } from '../app/context/DataContext';
import { WatchProgressProvider } from '../app/context/WatchProgressContext';
import { TMDbProvider } from '../app/context/TMDbContext';
import { SubtitleProvider } from '../app/context/SubtitleContext';

export function ClientProviders({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    if (
        pathname === '/debug' ||
        pathname?.startsWith('/debug/') ||
        pathname === '/legacy' ||
        pathname?.startsWith('/legacy/')
    ) {
        return <>{children}</>;
    }

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
