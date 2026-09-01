#!/usr/bin/env node
/**
 * Builds the webOS TV package and installs it on a Dev-Mode LG TV, then launches it.
 *
 *   node scripts/install-tv.mjs            # prod app
 *   node scripts/install-tv.mjs dev        # "(Dev)" app
 *   ARES_DEVICE=tv-quarto node scripts/install-tv.mjs
 *
 * The TV must already be registered with `ares-setup-device` (see
 * docs/tv-client.md). Device name comes from $ARES_DEVICE, or the first `-i`
 * argument, or defaults to "tv-sala".
 *
 * Prod and dev are different app ids, so installing one never removes the other.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const distDir = path.join(root, 'tv', 'dist');

const args = process.argv.slice(2);
const isDev = args.includes('dev');
const deviceFromArg = (() => {
    const i = args.indexOf('-i');
    return i !== -1 ? args[i + 1] : undefined;
})();
const device = process.env.ARES_DEVICE || deviceFromArg || 'tv-sala';

const appId = isDev ? 'com.xstreamplayer.tv.dev' : 'com.xstreamplayer.tv';
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));

function run(command, commandArgs) {
    console.log(`\n$ ${command} ${commandArgs.join(' ')}`);
    const result = spawnSync(command, commandArgs, { stdio: 'inherit', shell: true });
    if (result.status !== 0) {
        console.error(`\n[install:tv] "${command}" failed (exit ${result.status ?? 'signal'}).`);
        process.exit(result.status ?? 1);
    }
}

function has(command) {
    return spawnSync(command, ['--version'], { stdio: 'ignore', shell: true }).status === 0;
}

if (!has('ares-install')) {
    console.error(
        '[install:tv] ares CLI not found. Install it first:\n' +
        '  npm install -g @webosose/ares-cli',
    );
    process.exit(1);
}

// 1. Package (reuses the same script the store build uses).
run('node', ['scripts/package-tv.mjs', 'webos', ...(isDev ? ['dev'] : [])]);

// 2. Find the freshly built .ipk for this variant + version.
const ipk = path.join(distDir, `${appId}_${version}_all.ipk`);
if (!fs.existsSync(ipk)) {
    const found = fs.existsSync(distDir)
        ? fs.readdirSync(distDir).filter((f) => f.startsWith(appId) && f.endsWith('.ipk'))
        : [];
    console.error(
        `[install:tv] expected ${path.relative(root, ipk)} but it is not there.` +
        (found.length ? `\n  found instead: ${found.join(', ')}` : ''),
    );
    process.exit(1);
}

// 3. Install + launch.
run('ares-install', ['--device', device, ipk]);
run('ares-launch', ['--device', device, appId]);

console.log(
    `\n[install:tv] ${appId} v${version} installed on "${device}" and launched.` +
    `\n  inspect: ares-inspect --device ${device} --app ${appId}`,
);
