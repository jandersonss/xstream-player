'use client';

import { useEffect, useState } from 'react';
import { useSubtitle } from '@/app/context/SubtitleContext';
import { useProfile } from '@/app/context/ProfileContext';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import Field, { inputClassName } from '@/components/ui/Field';
import Badge from '@/components/ui/Badge';
import SectionHeader from '@/components/ui/SectionHeader';
import { Minus, Plus } from 'lucide-react';

// Same list used by SubtitleSearchPanel, kept here so the default language picker
// matches what the player offers.
const LANGUAGES = [
    { code: 'pt-BR', label: 'Português BR' },
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Español' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
    { code: 'it', label: 'Italiano' },
    { code: 'ja', label: '日本語' },
    { code: 'ko', label: '한국어' },
    { code: 'zh', label: '中文' },
    { code: 'ar', label: 'العربية' },
    { code: 'ru', label: 'Русский' },
];

// Same range/step VideoPlayer.tsx uses for the in-player font size control.
const MIN_FONT_SIZE = 0.8;
const MAX_FONT_SIZE = 2.5;
const FONT_SIZE_STEP = 0.1;
const DEFAULT_FONT_SIZE = 1.5;

function clampFontSize(size: number): number {
    return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, size));
}

/** OpenSubtitles key + per-profile subtitle preferences (spec 02 §5.4). */
export default function SubtitlesSection() {
    const { config, saveConfig, clearConfig, isConfigured, ensureConfigLoaded } = useSubtitle();
    const { activeProfile, updatePrefs } = useProfile();
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

    useEffect(() => {
        ensureConfigLoaded();
    }, [ensureConfigLoaded]);

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

    const language = activeProfile?.prefs.subtitleLanguage ?? 'pt-BR';
    const fontSize = activeProfile?.prefs.subtitleFontSize ?? DEFAULT_FONT_SIZE;

    return (
        <div>
            <SectionHeader
                title="Legendas"
                action={isConfigured ? <Badge tone="ok">Configurado</Badge> : undefined}
            />

            <div className="space-y-3 mb-6">
                <Field label="Chave de API (OpenSubtitles)" htmlFor="subtitle-api-key" error={error || undefined}>
                    <input
                        id="subtitle-api-key"
                        type="text"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        disabled={isSaving}
                        placeholder="Digite sua chave de API do OpenSubtitles"
                        data-focusable="true"
                        tabIndex={0}
                        className={inputClassName}
                    />
                </Field>
                <div className="flex space-x-2">
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

            <div className="mb-6">
                <Field label="Idioma padrão das legendas" htmlFor="subtitle-language">
                    <select
                        id="subtitle-language"
                        value={language}
                        onChange={(e) => updatePrefs({ subtitleLanguage: e.target.value })}
                        data-focusable="true"
                        tabIndex={0}
                        className={inputClassName}
                    >
                        {LANGUAGES.map((lang) => (
                            <option key={lang.code} value={lang.code}>
                                {lang.label}
                            </option>
                        ))}
                    </select>
                </Field>
            </div>

            <div>
                <p className="text-sm text-ink-2 mb-1.5">Tamanho da fonte</p>
                <div className="flex items-center space-x-3">
                    <IconButton
                        icon={Minus}
                        label="Diminuir fonte"
                        size="sm"
                        variant="secondary"
                        onClick={() => updatePrefs({ subtitleFontSize: clampFontSize(fontSize - FONT_SIZE_STEP) })}
                    />
                    <span className="text-sm text-ink tnum w-10 text-center">{fontSize.toFixed(1)}</span>
                    <IconButton
                        icon={Plus}
                        label="Aumentar fonte"
                        size="sm"
                        variant="secondary"
                        onClick={() => updatePrefs({ subtitleFontSize: clampFontSize(fontSize + FONT_SIZE_STEP) })}
                    />
                </div>
            </div>
        </div>
    );
}
