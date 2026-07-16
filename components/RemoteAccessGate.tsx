'use client';

import { FormEvent, useState } from 'react';
import { Lock, ShieldCheck, AlertCircle } from 'lucide-react';

const PIN_RULE_MESSAGE = 'Use 4 a 64 caracteres, com letras e números, sem símbolos.';

interface RemoteAccessGateProps {
    mode: 'setup' | 'verify';
}

export default function RemoteAccessGate({ mode }: RemoteAccessGateProps) {
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isSetup = mode === 'setup';

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setError('');

        if (!/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{4,64}$/.test(pin)) {
            setError(PIN_RULE_MESSAGE);
            return;
        }

        if (isSetup && pin !== confirmPin) {
            setError('A confirmação do PIN não confere.');
            return;
        }

        setIsSubmitting(true);

        try {
            const response = await fetch('/api/remote-access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || 'Não foi possível validar o PIN.');
            }

            window.location.reload();
        } catch (submitError: unknown) {
            setError(submitError instanceof Error ? submitError.message : 'Não foi possível validar o PIN.');
            setIsSubmitting(false);
        }
    };

    return (
        <main className="min-h-screen flex items-center justify-center bg-[#050505] text-white px-4">
            <div className="fixed inset-0 bg-[radial-gradient(circle_at_top,rgba(229,9,20,0.18),transparent_40%),linear-gradient(180deg,rgba(0,0,0,0.7),#050505)]" />

            <section className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-black/80 p-8 shadow-2xl">
                <div className="mb-8 text-center">
                    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-600 shadow-[0_0_30px_rgba(229,9,20,0.35)]">
                        {isSetup ? <ShieldCheck className="h-8 w-8" /> : <Lock className="h-8 w-8" />}
                    </div>
                    <h1 className="text-3xl font-bold">{isSetup ? 'Cadastrar PIN de acesso' : 'Acesso remoto protegido'}</h1>
                    <p className="mt-3 text-sm text-gray-400">
                        {isSetup
                            ? 'Crie um PIN alfanumérico para proteger acessos por domínio.'
                            : 'Informe o PIN para liberar a aplicação por 3 horas.'}
                    </p>
                </div>

                {error && (
                    <div className="mb-6 flex items-center space-x-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                        <AlertCircle size={18} className="flex-shrink-0" />
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-2">
                        <label htmlFor="remote-pin" className="ml-1 text-xs font-bold uppercase tracking-widest text-gray-500">
                            PIN
                        </label>
                        <input
                            id="remote-pin"
                            type="password"
                            inputMode="text"
                            autoComplete={isSetup ? 'new-password' : 'current-password'}
                            value={pin}
                            onChange={event => setPin(event.target.value)}
                            className="block w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 font-medium text-white placeholder-gray-500 transition-all duration-200 focus:border-red-500/50 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-red-500"
                            placeholder="Letras e números"
                            required
                            autoFocus
                            data-focusable="true"
                        />
                    </div>

                    {isSetup && (
                        <div className="space-y-2">
                            <label htmlFor="remote-pin-confirm" className="ml-1 text-xs font-bold uppercase tracking-widest text-gray-500">
                                Confirmar PIN
                            </label>
                            <input
                                id="remote-pin-confirm"
                                type="password"
                                inputMode="text"
                                autoComplete="new-password"
                                value={confirmPin}
                                onChange={event => setConfirmPin(event.target.value)}
                                className="block w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 font-medium text-white placeholder-gray-500 transition-all duration-200 focus:border-red-500/50 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-red-500"
                                placeholder="Repita o PIN"
                                required
                                data-focusable="true"
                            />
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className={`flex w-full items-center justify-center space-x-2 rounded-xl bg-red-600 px-4 py-4 text-lg font-bold text-white shadow-[0_0_20px_rgba(220,38,38,0.3)] transition-all duration-300 hover:bg-red-700 ${isSubmitting ? 'cursor-not-allowed opacity-70' : ''}`}
                        data-focusable="true"
                    >
                        {isSubmitting ? <span className="h-6 w-6 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : 'Liberar acesso'}
                    </button>
                </form>
            </section>
        </main>
    );
}
