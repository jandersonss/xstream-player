'use client';

import { useTvNavigation } from '../app/hooks/useTvNavigation';
import { NavigationProvider } from '../app/context/NavigationContext';

// Inner component that uses the navigation hook
function TvNavigationConsumer({ children }: { children: React.ReactNode }) {
    useTvNavigation();
    return <>{children}</>;
}

// Outer provider that wraps everything
export default function TvNavigationProvider({ children }: { children: React.ReactNode }) {
    return (
        <NavigationProvider>
            <TvNavigationConsumer>
                {children}
            </TvNavigationConsumer>
        </NavigationProvider>
    );
}
