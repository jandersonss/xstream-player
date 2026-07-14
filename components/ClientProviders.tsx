'use client';

import { usePathname } from 'next/navigation';
import TvNavigationProvider from '@/components/TvNavigationProvider';
import { AuthProvider } from '../app/context/AuthContext';
import { FavoritesProvider } from '../app/context/FavoritesContext';

import { DataProvider } from '../app/context/DataContext';
import { WatchProgressProvider } from '../app/context/WatchProgressContext';
import { TMDbProvider } from '../app/context/TMDbContext';
import { SubtitleProvider } from '../app/context/SubtitleContext';
import { ProfileProvider, useProfile } from '../app/context/ProfileContext';
import ProfileSelector from '@/components/ProfileSelector';

/**
 * Favorites and watch progress are loaded once on mount from the profile the
 * cookie points at, so switching profiles has to remount them — the key does
 * that without either context knowing profiles exist.
 */
function ProfileScopedProviders({ children }: { children: React.ReactNode }) {
    const { activeProfile, isLoaded, needsSelection } = useProfile();

    // Mounting the data providers before the active profile is known would make
    // them fetch for the wrong profile and immediately remount.
    if (!isLoaded) return null;

    if (needsSelection) return <ProfileSelector />;

    return (
        <FavoritesProvider key={activeProfile?.id ?? 'none'}>
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
    );
}

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
                <ProfileProvider>
                    <ProfileScopedProviders>
                        {children}
                    </ProfileScopedProviders>
                </ProfileProvider>
            </DataProvider>
        </AuthProvider>
    );
}
