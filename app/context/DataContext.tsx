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
    searchCachedStreams: (query: string, type?: 'live' | 'movie' | 'series') => Promise<db.CachedStream[]>;
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
    const isSyncingRef = useRef(false);
    const initializedForRef = useRef<string | null>(null);

    const cancelSync = useCallback(() => {
        cancelPollingRef.current = true;
        const jobId = activeJobIdRef.current;

        if (jobId) {
            fetch(`/api/sync?jobId=${encodeURIComponent(jobId)}`, { method: 'DELETE' })
                .catch(error => console.error('Failed to cancel server sync', error));
        }

        activeJobIdRef.current = null;
        isSyncingRef.current = false;
        setIsSyncing(false);
        setSyncProgress(0);
        console.log('Sync cancelled by user');
    }, []);

    const syncData = useCallback(async () => {
        if (!credentials || isSyncingRef.current) return;

        cancelPollingRef.current = false;
        isSyncingRef.current = true;
        setIsSyncing(true);
        setSyncProgress(0);

        try {
            console.log('[DataContext] Starting server-side sync via /api/sync');
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
            setSyncProgress(startBody.job.progress);

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
                isSyncingRef.current = false;
                setIsSyncing(false);
                setSyncProgress(0);
            }, 1000);
        }
    }, [credentials]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cancelPollingRef.current = true;
        };
    }, []);

    // Runs the initial metadata check + auto-sync once per set of credentials,
    // as soon as they become available (they start as null and are filled in
    // asynchronously by AuthContext). Keying on the credentials identity, and
    // not on a plain boolean, matters twice: a sync failure must not re-trigger
    // this effect (the identity is unchanged), but a different account logging
    // in must, since this provider outlives logout — it lives in the root
    // layout, so `logout()` only navigates and never unmounts it.
    useEffect(() => {
        if (!credentials) return;

        const identity = `${credentials.hostUrl}|${credentials.username}`;
        if (initializedForRef.current === identity) return;
        initializedForRef.current = identity;

        const initData = async () => {
            const meta = await db.getSyncMetadata('categories');
            if (meta) {
                setLastSync(meta.lastSync);

                // Check if last sync was more than 24h ago
                const oneDay = 24 * 60 * 60 * 1000;
                const now = Date.now();
                if (now - meta.lastSync > oneDay) {
                    console.log('Sincronizando conteúdo automaticamente (diário)...');
                    syncData();
                }
            } else {
                // Auto sync if no data found but logged in
                console.log('Sincronizando conteúdo automaticamente...');
                syncData();
            }
        };
        initData();
    }, [credentials, syncData]);

    const getCachedCategories = useCallback(async (type: 'live' | 'movie' | 'series') => {
        return db.getCategories(type);
    }, []);

    const getCachedStreams = useCallback(async (categoryId: string, type: 'live' | 'movie' | 'series') => {
        return db.getStreams(categoryId, type);
    }, []);

    const searchCachedStreams = useCallback(async (query: string, type?: 'live' | 'movie' | 'series') => {
        return db.searchStreams(query, type);
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
            searchCachedStreams,
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
