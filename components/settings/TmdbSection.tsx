'use client';

import { useState } from 'react';
import { useTMDb } from '@/app/context/TMDbContext';
import Button from '@/components/ui/Button';
import Field, { inputClassName } from '@/components/ui/Field';
import Badge from '@/components/ui/Badge';
import SectionHeader from '@/components/ui/SectionHeader';

/** TMDb API key — moved out of the home promo card into Ajustes (spec 02 §5.5). */
export default function TmdbSection() {
    const { config, saveConfig, clearConfig, isConfigured } = useTMDb();
    const [apiKey, setApiKey] = useState(config?.apiKey || '');
    // Mirrors the last config value applied to `apiKey`, so the field can pick up
    // the async config load by adjusting state during render (React's documented
    // pattern) instead of a setState-in-effect, which cascades an extra render.
    const [syncedApiKey, setSyncedApiKey] = useState(config?.apiKey);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    if (config?.apiKey !== syncedApiKey) {
        setSyncedApiKey(config?.apiKey);
        setApiKey(config?.apiKey || '');
    }

    const handleSave = async () => {
        if (!apiKey.trim()) {
            setError('Por favor, insira uma chave de API');
            return;
        }

        setIsSaving(true);
        setError('');
        const result = await saveConfig(apiKey.trim());
        setIsSaving(false);

        if (!result) {
            setError('Chave de API inválida. Verifique e tente novamente.');
        }
    };

    const handleClear = async () => {
        await clearConfig();
        setApiKey('');
        setError('');
    };

    return (
        <div>
            <SectionHeader
                title="TMDb"
                description="Ativa carrosséis personalizados na Início, filtrados pelo que já está no catálogo."
                action={isConfigured ? <Badge tone="ok">Configurado</Badge> : undefined}
            />

            <Field label="Chave de API (v3)" htmlFor="tmdb-api-key" error={error || undefined}>
                <input
                    id="tmdb-api-key"
                    type="text"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    disabled={isSaving}
                    placeholder="Digite sua chave de API do TMDb"
                    data-focusable={isSaving ? undefined : 'true'}
                    tabIndex={isSaving ? undefined : 0}
                    className={inputClassName}
                />
            </Field>

            <div className="flex space-x-2 mt-3">
                <Button onClick={handleSave} loading={isSaving} disabled={isSaving}>
                    Salvar
                </Button>
                {isConfigured && (
                    <Button variant="ghost" onClick={handleClear} disabled={isSaving}>
                        Remover
                    </Button>
                )}
            </div>
        </div>
    );
}
