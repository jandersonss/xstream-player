import 'server-only';

import path from 'path';
import { isSafeSegment } from './pathSafety';

export const DEFAULT_SUBTITLE_LANGUAGE = 'pt-BR';

export const SUBTITLES_DIR = path.join(process.cwd(), 'data', 'subtitles');

/**
 * Subtitles are cached per language: keying the file by stream alone let a
 * download in one language overwrite another language's subtitle for the same
 * content. The cache is shared by every profile — a profile only decides which
 * language to ask for.
 *
 * Returns null when the ids would widen the path (both reach us from the client).
 */
export function resolveSubtitlePath(streamId: string, language: string): string | null {
    if (!isSafeSegment(streamId) || !isSafeSegment(language)) return null;
    return path.join(SUBTITLES_DIR, language, `subtitle-${streamId}.json`);
}

export function subtitleLanguageDir(language: string): string | null {
    if (!isSafeSegment(language)) return null;
    return path.join(SUBTITLES_DIR, language);
}
