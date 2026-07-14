import 'server-only';

/**
 * Rejects any value that must not widen a filesystem path built from it.
 * Stream ids, content types and language codes all reach us from the client
 * and are interpolated into file names, so a bare `..` or a slash there would
 * escape the data directory.
 */
export function isSafeSegment(value: string): boolean {
    return /^[A-Za-z0-9._-]+$/.test(value) && value !== '.' && value !== '..';
}
