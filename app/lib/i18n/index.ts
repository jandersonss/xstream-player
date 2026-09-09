import ptBR from './translations/pt-BR.json';
import en from './translations/en.json';

/**
 * UI translation registry.
 *
 * Adding a language is one JSON file under `translations/` plus one entry in
 * `LOCALES` below — nothing else. `pt-BR.json` is the source of truth for the
 * key set; every other file mirrors its shape (a missing key falls back to the
 * pt-BR string, then to the raw key).
 */
export type Messages = typeof ptBR;

export interface LocaleEntry {
    /** BCP-47 tag, also the cookie/localStorage value. */
    code: string;
    /** Endonym shown in the language picker. */
    label: string;
    messages: Messages;
}

/** App default: the fallback for a missing translation key and an invalid saved choice. */
export const DEFAULT_LOCALE = 'pt-BR';

/**
 * First-run fallback when the browser's language matches no supported locale.
 * English, not the app default — a non-Portuguese speaker reads it more easily.
 */
export const AUTODETECT_FALLBACK_LOCALE = 'en';

export const LOCALES: LocaleEntry[] = [
    { code: 'pt-BR', label: 'Português (Brasil)', messages: ptBR },
    { code: 'en', label: 'English', messages: en as Messages },
];

export const LOCALE_COOKIE = 'xstream_locale';

const FALLBACK_MESSAGES = ptBR;

export function isSupportedLocale(code: string | null | undefined): code is string {
    return !!code && LOCALES.some((l) => l.code === code);
}

export function resolveLocale(code: string | null | undefined): string {
    return isSupportedLocale(code) ? code : DEFAULT_LOCALE;
}

/**
 * Best supported locale for a list of BCP-47 tags, newest browser preference
 * first (from `navigator.languages` or a parsed `Accept-Language` header). Tries
 * an exact match, then a primary-subtag match (`en-US` -> `en`, `pt` -> `pt-BR`).
 * Returns `null` when nothing matches, so the caller can fall back explicitly.
 */
export function matchLocale(tags: readonly string[]): string | null {
    for (const raw of tags) {
        const tag = raw.trim().toLowerCase();
        if (!tag) continue;

        const exact = LOCALES.find((l) => l.code.toLowerCase() === tag);
        if (exact) return exact.code;

        const primary = tag.split('-')[0];
        const byPrimary = LOCALES.find((l) => l.code.toLowerCase().split('-')[0] === primary);
        if (byPrimary) return byPrimary.code;
    }
    return null;
}

/**
 * Best supported locale for an `Accept-Language` header (tags ranked by q-value).
 * Falls back to English when nothing matches or the header is absent — the app
 * default (pt-BR) is only used once the user has actually chosen it.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): string {
    if (!header) return AUTODETECT_FALLBACK_LOCALE;

    const ranked = header
        .split(',')
        .map((part) => {
            const [tag, ...params] = part.trim().split(';');
            const q = params.find((p) => p.trim().startsWith('q='));
            const weight = q ? parseFloat(q.split('=')[1]) : 1;
            return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0 };
        })
        .filter((entry) => entry.tag && entry.tag !== '*')
        .sort((a, b) => b.weight - a.weight)
        .map((entry) => entry.tag);

    return matchLocale(ranked) ?? AUTODETECT_FALLBACK_LOCALE;
}

export function getMessages(code: string | null | undefined): Messages {
    return LOCALES.find((l) => l.code === code)?.messages ?? FALLBACK_MESSAGES;
}

type Vars = Record<string, string | number>;

/**
 * Look up a dot-path key and interpolate `{name}` placeholders. Falls back to
 * the pt-BR string for a missing key, and to the raw key if that is missing too
 * — a missing translation is always visible, never a crash.
 */
export function translate(messages: Messages, key: string, vars?: Vars): string {
    const raw = readPath(messages, key) ?? readPath(FALLBACK_MESSAGES, key) ?? key;
    if (typeof raw !== 'string') return key;
    if (!vars) return raw;
    return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
        Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : `{${name}}`
    );
}

/**
 * Server-side translation for API routes. They cannot use the React context, so
 * they read the locale straight off the request cookie. Falls back to pt-BR.
 */
export function translateForRequest(
    request: { cookies: { get(name: string): { value: string } | undefined } },
    key: string,
    vars?: Vars
): string {
    const locale = request.cookies.get(LOCALE_COOKIE)?.value;
    return translate(getMessages(resolveLocale(locale)), key, vars);
}

function readPath(obj: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, part) => {
        if (acc && typeof acc === 'object') {
            return (acc as Record<string, unknown>)[part];
        }
        return undefined;
    }, obj);
}
