#!/usr/bin/env node
/**
 * Moves subtitles from the flat pre-language layout into per-language folders:
 *
 *   data/subtitles/subtitle-<streamId>.json
 *   → data/subtitles/<language>/subtitle-<streamId>.json
 *
 * The language is read from the `language` field inside each file (the old
 * layout stored it there but not in the path, so a download in one language
 * silently overwrote another language's subtitle for the same stream).
 *
 * Standalone on purpose: no dependencies and not wired into package.json, so it
 * can run against a live container:
 *
 *   docker exec <container> node scripts/migrate-subtitles.mjs
 *   docker exec <container> node scripts/migrate-subtitles.mjs --dry-run
 *
 * Safe to run more than once: already-migrated files are left alone, and a
 * subtitle whose destination already exists is kept (never overwritten).
 */

import { readdir, readFile, rename, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_LANGUAGE = 'pt-BR';
const SUBTITLES_DIR = path.join(process.cwd(), 'data', 'subtitles');
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

const dryRun = process.argv.includes('--dry-run');

async function exists(target) {
    try {
        await stat(target);
        return true;
    } catch {
        return false;
    }
}

async function main() {
    if (!(await exists(SUBTITLES_DIR))) {
        console.log(`Nothing to do: ${SUBTITLES_DIR} does not exist.`);
        return;
    }

    const entries = await readdir(SUBTITLES_DIR, { withFileTypes: true });
    const legacy = entries.filter(
        e => e.isFile() && e.name.startsWith('subtitle-') && e.name.endsWith('.json')
    );

    if (legacy.length === 0) {
        console.log('Nothing to do: no subtitles in the old flat layout.');
        return;
    }

    console.log(`${legacy.length} subtitle(s) to migrate${dryRun ? ' (dry run)' : ''}.`);

    let moved = 0;
    let skipped = 0;

    for (const entry of legacy) {
        const from = path.join(SUBTITLES_DIR, entry.name);

        let language = DEFAULT_LANGUAGE;
        try {
            const parsed = JSON.parse(await readFile(from, 'utf-8'));
            if (typeof parsed.language === 'string' && parsed.language.trim()) {
                language = parsed.language.trim();
            }
        } catch (error) {
            console.warn(`  ! ${entry.name}: unreadable (${error.message}); assuming ${DEFAULT_LANGUAGE}`);
        }

        if (!SAFE_SEGMENT.test(language)) {
            console.warn(`  ! ${entry.name}: unusable language "${language}"; assuming ${DEFAULT_LANGUAGE}`);
            language = DEFAULT_LANGUAGE;
        }

        const to = path.join(SUBTITLES_DIR, language, entry.name);

        if (await exists(to)) {
            console.log(`  = ${entry.name} → ${language}/ already exists, keeping destination`);
            skipped++;
            continue;
        }

        console.log(`  → ${entry.name} → ${language}/${entry.name}`);
        if (!dryRun) {
            await mkdir(path.dirname(to), { recursive: true });
            await rename(from, to);
        }
        moved++;
    }

    console.log(dryRun
        ? `\nDry run: ${moved} would move, ${skipped} would be skipped. Nothing was changed.`
        : `\nDone: ${moved} moved, ${skipped} skipped.`);
}

main().catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
});
