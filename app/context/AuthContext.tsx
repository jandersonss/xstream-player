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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<UserInfo | null>(null);
    const [server, setServer] = useState<ServerInfo | null>(null);
    const [credentials, setCredentials] = useState<AuthState['credentials']>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const initAuth = async () => {
            // Priority 1: Check server-side config
            try {
                const res = await fetch('/api/config');
                const data = await res.json();
                if (data && data.credentials) {
                    setCredentials(data.credentials);
                    setUser(data.user);
                    setServer(data.server);
                    setIsAuthenticated(true);
                    setIsLoading(false);
                    return;
                }
            } catch (e) {
                console.error("Failed to fetch server config", e);
            }

            // Priority 2: Check local storage fallback
            const stored = localStorage.getItem('xstream_auth');
            if (stored) {
                try {
                    const { credentials, user, server } = JSON.parse(stored);
                    setCredentials(credentials);
                    setUser(user);
                    setServer(server);
                    setIsAuthenticated(true);
                } catch (e) {
                    console.error("Failed to parse stored auth", e);
                    localStorage.removeItem('xstream_auth');
                }
            }
            setIsLoading(false);
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
