'use client';

import { useTvNavigation } from '../app/hooks/useTvNavigation';

export default function TvNavigationProvider({ children }: { children: React.ReactNode }) {
    useTvNavigation();
    return <>{children}</>;
}
