'use client';

import { useI18n } from '@/app/context/I18nContext';
import Field, { inputClassName } from '@/components/ui/Field';
import SectionHeader from '@/components/ui/SectionHeader';

/** Interface language picker. New languages come from `app/lib/i18n`. */
export default function LanguageSection() {
    const { locale, locales, setLocale, t } = useI18n();

    return (
        <div>
            <SectionHeader
                title={t('settings.language.title')}
                description={t('settings.language.description')}
            />

            <Field label={t('settings.language.label')} htmlFor="ui-language">
                {/* Width capped to the control column: a full-bleed <select>
                    centred on the page loses the D-pad cross-axis tie-break to
                    the left-aligned buttons in the sections above and below it
                    (app/hooks/useTvNavigation.ts), so it became unreachable. */}
                <select
                    id="ui-language"
                    value={locale}
                    onChange={(e) => setLocale(e.target.value)}
                    data-focusable="true"
                    tabIndex={0}
                    className={`${inputClassName} max-w-[15rem]`}
                >
                    {locales.map((l) => (
                        <option key={l.code} value={l.code}>
                            {l.label}
                        </option>
                    ))}
                </select>
            </Field>
        </div>
    );
}
