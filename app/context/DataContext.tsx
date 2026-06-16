'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import * as db from '../lib/db';

interface DataContextType {
    isSyncing: boolean;
    lastSync: number | null;
    syncProgress: number;
    syncData: () => Promise<void>;
    cancelSync: () => void;
    getCachedCategories: (type: 'live' | 'movie' | 'series') => Promise<db.CachedCategory[]>;
    getCachedStreams: (categoryId: string, type: 'live' | 'movie' | 'series') => Promise<db.CachedStream[]>;
    getAllCachedStreams: (type?: 'live' | 'movie' | 'series') => Promise<db.CachedStream[]>;
    getCachedDetail: <T = Record<string, unknown>>(id: string | number) => Promise<T | undefined>;
    saveCachedDetail: (id: string | number, data: unknown) => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

interface ServerSyncJob {
    id: string;
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    progress: number;
    message: string;
    lastSync?: number;
    error?: string;
}

export function DataProvider({ children }: { children: React.ReactNode }) {
    const { credentials } = useAuth();
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState(0);
    const [lastSync, setLastSync] = useState<number | null>(null);
    const activeJobIdRef = useRef<string | null>(null);
    const cancelPollingRef = useRef(false);

    const cancelSync = useCallback(() => {
        cancelPollingRef.current = true;
        const jobId = activeJobIdRef.current;

        if (jobId) {
            fetch(`/api/sync?jobId=${encodeURIComponent(jobId)}`, { method: 'DELETE' })
                .catch(error => console.error('Failed to cancel server sync', error));
        }

        activeJobIdRef.current = null;
        setIsSyncing(false);
        setSyncProgress(0);
        console.log('Sync cancelled by user');
    }, []);

    const syncData = useCallback(async () => {
        if (!credentials || isSyncing) return;

        cancelPollingRef.current = false;
        setIsSyncing(true);
        setSyncProgress(0);

        try {
            const startResponse = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials),
            });

            if (!startResponse.ok) {
                throw new Error('Falha ao iniciar sincronizacao no servidor');
            }

            const startBody = await startResponse.json() as { job: ServerSyncJob };
            activeJobIdRef.current = startBody.job.id;

            while (!cancelPollingRef.current && activeJobIdRef.current) {
                const statusResponse = await fetch(`/api/sync?jobId=${encodeURIComponent(activeJobIdRef.current)}`);
                if (!statusResponse.ok) {
                    throw new Error('Falha ao consultar sincronizacao no servidor');
                }

                const statusBody = await statusResponse.json() as { job: ServerSyncJob | null };
                const job = statusBody.job;

                if (!job) break;

                setSyncProgress(job.progress);

                if (job.status === 'completed') {
                    const timestamp = job.lastSync ?? Date.now();
                    setLastSync(timestamp);
                    setSyncProgress(100);
                    break;
                }

                if (job.status === 'failed') {
                    throw new Error(job.error || job.message || 'Falha na sincronizacao');
                }

                if (job.status === 'cancelled') {
                    break;
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error('Server sync error:', error);
        } finally {
            activeJobIdRef.current = null;
            setTimeout(() => {
                setIsSyncing(false);
                setSyncProgress(0);
            }, 1000);
        }
    }, [credentials, isSyncing]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cancelPollingRef.current = true;
        };
    }, []);

    useEffect(() => {
        const initData = async () => {
            const meta = await db.getSyncMetadata('categories');
            if (meta) {
                setLastSync(meta.lastSync);

                // Check if last sync was more than 24h ago
                const oneDay = 24 * 60 * 60 * 1000;
                const now = Date.now();
                if (credentials && !isSyncing && (now - meta.lastSync > oneDay)) {
                    console.log('Sincronizando conteúdo automaticamente (diário)...');
                    syncData();
                }
            } else if (credentials && !isSyncing) {
                // Auto sync if no data found but logged in
                console.log('Sincronizando conteúdo automaticamente...');
                syncData();
            }
        };
        initData();
    }, [credentials, isSyncing, syncData]);

    const getCachedCategories = useCallback(async (type: 'live' | 'movie' | 'series') => {
        return db.getCategories(type);
    }, []);

    const getCachedStreams = useCallback(async (categoryId: string, type: 'live' | 'movie' | 'series') => {
        return db.getStreams(categoryId, type);
    }, []);

    const getAllCachedStreams = useCallback(async (type?: 'live' | 'movie' | 'series') => {
        return db.getAllStreams(type);
    }, []);

    const getCachedDetail = useCallback(async <T = Record<string, unknown>,>(id: string | number) => {
        return db.getDetail<T>(id);
    }, []);

    const saveCachedDetail = useCallback(async (id: string | number, data: unknown) => {
        await db.saveDetail(id, data);
    }, []);

    return (
        <DataContext.Provider value={{
            isSyncing,
            lastSync,
            syncProgress,
            syncData,
            cancelSync,
            getCachedCategories,
            getCachedStreams,
            getAllCachedStreams,
            getCachedDetail,
            saveCachedDetail
        }}>
            {children}
        </DataContext.Provider>
    );
}

export function useData() {
    const context = useContext(DataContext);
    if (context === undefined) {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
}
