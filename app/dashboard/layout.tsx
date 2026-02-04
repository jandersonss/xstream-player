'use client';

import Sidebar from '@/components/Sidebar';
import BottomNav from '@/components/BottomNav';
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
            <div className="min-h-screen flex items-center justify-center bg-black text-white">
                <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!isAuthenticated) return null;

    return (
        <div className="flex flex-col md:flex-row h-screen bg-background overflow-hidden">
            <Sidebar />

            <main className="flex-1 overflow-y-auto h-full transition-all duration-300 pb-16 md:pb-0">
                <div className="p-4 md:p-6 lg:p-10 max-w-[1600px] mx-auto min-h-full">
                    {children}
                </div>
            </main>

            <BottomNav />
        </div>
    );
}
