'use client';

import { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { useRouter } from 'next/navigation';
import Field, { inputClassName } from '@/components/ui/Field';
import Button from '@/components/ui/Button';

export default function LoginPage() {
    const { login, isAuthenticated, isLoading } = useAuth();
    const router = useRouter();

    const [hostUrl, setHostUrl] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isAuthenticated) {
            router.push('/dashboard');
        }
    }, [isAuthenticated, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        if (!hostUrl || !username || !password) {
            setError('Por favor, preencha todos os campos');
            setIsSubmitting(false);
            return;
        }

        try {
            await login(hostUrl, username, password);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Falha no login. Por favor, verifique suas credenciais.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-bg text-ink">
                <div className="w-16 h-16 border-4 border-ink border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-bg px-4">
            <div className="w-full max-w-sm">
                <div className="text-center mb-10">
                    <h1 className="text-3xl font-semibold text-ink tracking-tight">
                        <span className="text-brand">X</span>stream
                    </h1>
                    <p className="text-ink-2 text-sm mt-2">Insira suas credenciais IPTV para transmitir</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <Field label="URL do Servidor" htmlFor="host-url">
                        <input
                            id="host-url"
                            type="url"
                            placeholder="http://example.com:8080"
                            value={hostUrl}
                            onChange={(e) => setHostUrl(e.target.value)}
                            className={inputClassName}
                            required
                            data-focusable="true"
                        />
                    </Field>

                    <Field label="Usuário" htmlFor="username">
                        <input
                            id="username"
                            type="text"
                            placeholder="Usuário"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className={inputClassName}
                            required
                            data-focusable="true"
                        />
                    </Field>

                    <Field label="Senha" htmlFor="password">
                        <input
                            id="password"
                            type="password"
                            placeholder="Senha"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={inputClassName}
                            required
                            data-focusable="true"
                        />
                    </Field>

                    {error && <p className="text-brand text-sm">{error}</p>}

                    <Button type="submit" variant="primary" size="lg" fullWidth loading={isSubmitting}>
                        Entrar
                    </Button>
                </form>

                <div className="mt-8 text-center border-t border-line pt-6">
                    <p className="text-xs text-ink-3 font-mono">Compatível com Xtream Codes API</p>
                </div>
            </div>
        </div>
    );
}
