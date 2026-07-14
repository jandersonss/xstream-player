/**
 * Fold a title into the form stored in `streams.search_name` and used to match
 * search queries against it.
 *
 * SQLite's LIKE/LOWER are ASCII-only, so they never fold "Â" into "a". Accent
 * insensitivity therefore has to be baked into the stored value and applied to
 * the query with the same function, so "panico" and "pânico" both collapse to
 * "panico" and match each other.
 *
 * NFD splits an accented letter into base + combining mark, and the marks are
 * dropped before the punctuation pass — otherwise the mark would itself become
 * a space and "pânico" would fold to "pa nico".
 *
 * Punctuation collapses to a single space, which also makes "spider man" match
 * "Spider-Man" and strips the LIKE wildcards ("%", "_") out of user input.
 */
export function foldForSearch(value: string): string {
    if (!value) return '';

    return value
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}
