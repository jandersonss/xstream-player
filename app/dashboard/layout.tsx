'use client';

import NavRail from '@/components/NavRail';
import BottomNav from '@/components/BottomNav';
import Loader from '@/components/Loader';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { isAuthenticated, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.push('/');
        }
    }, [isAuthenticated, isLoading, router]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-bg text-ink">
                <Loader />
            </div>
        );
    }

    if (!isAuthenticated) return null;

    return (
        <div className="flex flex-col md:flex-row h-screen bg-bg overflow-hidden">
            <NavRail />
            <main className="flex-1 overflow-y-auto h-full pb-16 md:pb-0">
                <div className="max-w-[1800px] mx-auto min-h-full">{children}</div>
            </main>
            <BottomNav />
        </div>
    );
}
