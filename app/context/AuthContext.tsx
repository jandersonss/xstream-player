'use client';
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import * as db from '../lib/db';

interface UserInfo {
    username: string;
    status: string;
    exp_date: string;
    active_cons: string;
    max_connections: string;
}

interface ServerInfo {
    url: string;
    port: string;
    https_port: string;
    server_protocol: string;
    rtmp_port: string;
    timezone: string;
    timestamp_now: number;
    time_now: string;
}

interface StoredAuthData {
    credentials: {
        username: string;
        password: string;
        hostUrl: string;
    };
    user: UserInfo;
    server: ServerInfo;
}

interface AuthState {
    user: UserInfo | null;
    server: ServerInfo | null;
    credentials: {
        username: string;
        password: string;
        hostUrl: string;
    } | null;
    isAuthenticated: boolean;
    login: (serverUrl: string, user: string, pass: string) => Promise<void>;
    logout: () => void;
    isLoading: boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

function readStoredAuth(): StoredAuthData | null {
    try {
        const stored = localStorage.getItem('xstream_auth');
        if (!stored) return null;

        const parsed = JSON.parse(stored) as StoredAuthData;
        if (!parsed.credentials || !parsed.user || !parsed.server) return null;

        return parsed;
    } catch (e) {
        console.error("Failed to parse stored auth", e);
        localStorage.removeItem('xstream_auth');
        return null;
    }
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 6000): Promise<T | null> {
    let timeoutId: number | undefined;

    try {
        const response = await Promise.race([
            fetch(url),
            new Promise<never>((_, reject) => {
                timeoutId = window.setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
            })
        ]);

        return await response.json() as T;
    } catch (e) {
        console.warn(`Request failed or timed out: ${url}`, e);
        return null;
    } finally {
        if (timeoutId) window.clearTimeout(timeoutId);
    }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<UserInfo | null>(null);
    const [server, setServer] = useState<ServerInfo | null>(null);
    const [credentials, setCredentials] = useState<AuthState['credentials']>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const initAuth = async () => {
            try {
                const storedAuth = readStoredAuth();
                if (storedAuth) {
                    setCredentials(storedAuth.credentials);
                    setUser(storedAuth.user);
                    setServer(storedAuth.server);
                    setIsAuthenticated(true);
                    setIsLoading(false);
                }

                const data = await fetchJsonWithTimeout<Partial<StoredAuthData>>('/api/config');
                if (data?.credentials && data.user && data.server) {
                    setCredentials(data.credentials);
                    setUser(data.user);
                    setServer(data.server);
                    setIsAuthenticated(true);

                    try {
                        localStorage.setItem('xstream_auth', JSON.stringify(data));
                    } catch (e) {
                        console.warn("Failed to cache server auth", e);
                    }
                } else if (!storedAuth) {
                    setIsAuthenticated(false);
                }
            } catch (e) {
                console.error("Critical error in initAuth:", e);
                if (!readStoredAuth()) {
                    setUser(null);
                    setServer(null);
                    setCredentials(null);
                    setIsAuthenticated(false);
                } else {
                    const storedAuth = readStoredAuth();
                    if (storedAuth) {
                        setCredentials(storedAuth.credentials);
                        setUser(storedAuth.user);
                        setServer(storedAuth.server);
                        setIsAuthenticated(true);
                    }
                }
            } finally {
                setIsLoading(false);
            }
        };

        initAuth();
    }, []);

    const login = async (hostUrl: string, username: string, password: string) => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ hostUrl, username, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Falha no login');
            }

            const userInfo = data.user_info;
            const serverInfo = data.server_info;

            const authData = {
                credentials: { hostUrl, username, password },
                user: userInfo,
                server: serverInfo
            };

            localStorage.setItem('xstream_auth', JSON.stringify(authData));

            setUser(userInfo);
            setServer(serverInfo);
            setCredentials(authData.credentials);
            setIsAuthenticated(true);

            router.push('/dashboard');

        } catch (error) {
            console.error(error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async () => {
        try {
            await Promise.all([
                fetch('/api/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                }),
                db.clearCache()
            ]);
        } catch (e) {
            console.error("Failed to clear server config or database", e);
        }
        localStorage.removeItem('xstream_auth');
        setUser(null);
        setServer(null);
        setCredentials(null);
        setIsAuthenticated(false);
        router.push('/');
    };

    return (
        <AuthContext.Provider value={{ user, server, credentials, isAuthenticated, login, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
