'use client';

import { FormEvent, useState } from 'react';
import { Lock, ShieldCheck, AlertCircle } from 'lucide-react';
import { apiFetch } from '@/app/lib/apiClient';
import Field, { inputClassName } from '@/components/ui/Field';
import Button from '@/components/ui/Button';

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
            const response = await apiFetch('/api/remote-access', {
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
        <main className="min-h-screen flex items-center justify-center bg-bg text-ink px-4">
            <section className="w-full max-w-sm bg-surface-2 border border-line rounded-xl p-8">
                <div className="mb-8 text-center">
                    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-xl bg-surface-3">
                        {isSetup ? <ShieldCheck className="h-8 w-8 text-ink" /> : <Lock className="h-8 w-8 text-ink" />}
                    </div>
                    <h1 className="text-2xl font-semibold">{isSetup ? 'Cadastrar PIN de acesso' : 'Acesso remoto protegido'}</h1>
                    <p className="mt-3 text-sm text-ink-2">
                        {isSetup
                            ? 'Crie um PIN alfanumérico para proteger acessos por domínio.'
                            : 'Informe o PIN para liberar a aplicação por 3 horas.'}
                    </p>
                </div>

                {error && (
                    <div className="mb-6 flex items-center space-x-3 rounded-lg border border-line bg-surface p-4 text-sm text-brand">
                        <AlertCircle size={18} className="flex-shrink-0" />
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <Field label="PIN" htmlFor="remote-pin">
                        <input
                            id="remote-pin"
                            type="password"
                            inputMode="numeric"
                            autoComplete={isSetup ? 'new-password' : 'current-password'}
                            value={pin}
                            onChange={event => setPin(event.target.value)}
                            className={`${inputClassName} tnum text-center tracking-[0.4em]`}
                            placeholder="Letras e números"
                            required
                            autoFocus
                            data-focusable="true"
                        />
                    </Field>

                    {isSetup && (
                        <Field label="Confirmar PIN" htmlFor="remote-pin-confirm">
                            <input
                                id="remote-pin-confirm"
                                type="password"
                                inputMode="numeric"
                                autoComplete="new-password"
                                value={confirmPin}
                                onChange={event => setConfirmPin(event.target.value)}
                                className={`${inputClassName} tnum text-center tracking-[0.4em]`}
                                placeholder="Repita o PIN"
                                required
                                data-focusable="true"
                            />
                        </Field>
                    )}

                    <Button type="submit" variant="primary" fullWidth loading={isSubmitting}>
                        Liberar acesso
                    </Button>
                </form>
            </section>
        </main>
    );
}
