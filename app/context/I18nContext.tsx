'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import {
    DEFAULT_LOCALE,
    LOCALES,
    LOCALE_COOKIE,
    getMessages,
    resolveLocale,
    translate,
} from '../lib/i18n';

type Vars = Record<string, string | number>;

interface I18nState {
    /** Active BCP-47 locale tag. */
    locale: string;
    /** Every locale the app can switch to. */
    locales: { code: string; label: string }[];
    /** Translate a dot-path key, interpolating `{name}` placeholders. */
    t: (key: string, vars?: Vars) => string;
    setLocale: (code: string) => void;
}

const I18nContext = createContext<I18nState | undefined>(undefined);

// The API routes never read this — it only decides which bundled dictionary the
// client renders. Mirrored to localStorage for the packaged TV client, where the
// document origin can drop cookies (same reasoning as PROFILE_COOKIE_NAME).
function persistLocale(code: string) {
    const oneYear = 60 * 60 * 24 * 365;
    document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=${oneYear}; SameSite=Lax`;
    try {
        localStorage.setItem(LOCALE_COOKIE, code);
    } catch {
        /* storage unavailable — the cookie alone is enough on the web */
    }
}

export function I18nProvider({
    initialLocale,
    children,
}: {
    /** Read from the cookie server-side in the root layout, so the first paint matches. */
    initialLocale?: string;
    children: ReactNode;
}) {
    const [locale, setLocaleState] = useState(() => resolveLocale(initialLocale ?? DEFAULT_LOCALE));

    // The packaged TV client may not have sent a cookie; reconcile with the
    // localStorage mirror once, after hydration, to avoid a mismatch.
    useEffect(() => {
        try {
            const stored = localStorage.getItem(LOCALE_COOKIE);
            if (stored && stored !== locale) {
                setLocaleState(resolveLocale(stored));
            }
        } catch {
            /* ignore */
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const messages = useMemo(() => getMessages(locale), [locale]);

    const t = useCallback(
        (key: string, vars?: Vars) => translate(messages, key, vars),
        [messages]
    );

    const setLocale = useCallback((code: string) => {
        const next = resolveLocale(code);
        persistLocale(next);
        setLocaleState(next);
        document.documentElement.lang = next;
    }, []);

    const value = useMemo<I18nState>(
        () => ({
            locale,
            locales: LOCALES.map(({ code, label }) => ({ code, label })),
            t,
            setLocale,
        }),
        [locale, t, setLocale]
    );

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
    const context = useContext(I18nContext);
    if (context === undefined) {
        throw new Error('useI18n must be used within an I18nProvider');
    }
    return context;
}

/** Shorthand for components that only need the translate function. */
export function useT() {
    return useI18n().t;
}
