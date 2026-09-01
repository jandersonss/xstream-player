#!/usr/bin/env node
/**
 * Packages the TV client for a platform.
 *
 *   node scripts/package-tv.mjs webos        → tv/dist/<id>_<version>_all.ipk
 *   node scripts/package-tv.mjs webos dev    → the "(Dev)" variant, own app id
 *   node scripts/package-tv.mjs tizen [dev]  → tv/dist/<name>.wgt
 *
 * The payload is `tv/bootstrap/` plus the generated assets: the client's whole
 * job is to find the server, pair, and hand over to it, so nothing else needs to
 * ship inside the package. Version comes from package.json so the store build and
 * the server release never drift apart.
 *
 * The `dev` variant is a *separate installable app* (distinct id, amber icon,
 * "(Dev)" in the name) so a dev build and a prod build coexist on the same TV
 * instead of overwriting each other. Each remembers its own server address.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const staging = path.join(root, '.tv-pkg');
const distDir = path.join(root, 'tv', 'dist');

const platform = process.argv[2];
const variant = process.argv[3];

if (platform !== 'webos' && platform !== 'tizen') {
    console.error('usage: node scripts/package-tv.mjs <webos|tizen> [dev]');
    process.exit(1);
}

if (variant !== undefined && variant !== 'dev') {
    console.error(`unknown variant "${variant}" — the only variant is "dev"`);
    process.exit(1);
}

const isDev = variant === 'dev';

const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));

/** webOS app id + display title per variant. */
const WEBOS_APP = isDev
    ? { id: 'com.xstreamplayer.tv.dev', title: 'XStream Player (Dev)' }
    : { id: 'com.xstreamplayer.tv', title: 'XStream Player' };

/** Tizen package id (exactly 10 alnum), application id and name per variant. */
const TIZEN_APP = isDev
    ? { pkg: 'XstrmPlyrD', appId: 'XstrmPlyrD.XStreamPlayerDev', name: 'XStream Player (Dev)' }
    : { pkg: 'XstrmPlyr0', appId: 'XstrmPlyr0.XStreamPlayer', name: 'XStream Player' };

function has(command) {
    return spawnSync(command, ['--version'], { stdio: 'ignore', shell: true }).status === 0;
}

function run(command, args) {
    const result = spawnSync(command, args, { stdio: 'inherit', shell: true });

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

function stagePayload() {
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(staging, { recursive: true });
    fs.mkdirSync(distDir, { recursive: true });

    fs.cpSync(path.join(root, 'tv', 'bootstrap'), staging, { recursive: true });

    const assets = path.join(root, 'tv', 'assets');
    const iconSource = isDev ? 'icon-dev.png' : 'icon.png';

    if (!fs.existsSync(path.join(assets, iconSource))) {
        console.error('[package:tv] missing tv/assets — run: python3 scripts/gen-tv-assets.py');
        process.exit(1);
    }

    // Always staged as `icon.png` so the manifests do not need to know the variant.
    fs.copyFileSync(path.join(assets, iconSource), path.join(staging, 'icon.png'));
    fs.copyFileSync(path.join(assets, 'splash.png'), path.join(staging, 'splash.png'));
}

function packageWebos() {
    if (!has('ares-package')) {
        console.error(
            '[package:tv] ares-package not found. Install the webOS CLI first:\n' +
            '  npm install -g @webos-tools/cli',
        );
        process.exit(1);
    }

    const appinfo = JSON.parse(
        fs.readFileSync(path.join(root, 'tv', 'webos', 'appinfo.json'), 'utf-8'),
    );
    appinfo.version = version;
    appinfo.id = WEBOS_APP.id;
    appinfo.title = WEBOS_APP.title;

    fs.writeFileSync(
        path.join(staging, 'appinfo.json'),
        `${JSON.stringify(appinfo, null, 4)}\n`,
    );

    run('ares-package', [staging, '--outdir', distDir, '--no-minify']);
}

function packageTizen() {
    if (!has('tizen')) {
        console.error(
            '[package:tv] tizen CLI not found. Install Tizen Studio and put its\n' +
            '  tools/ide/bin on PATH, then create a signing profile with:\n' +
            '  tizen security-profiles add -n xstream -a <author.p12> -p <password>',
        );
        process.exit(1);
    }

    const config = fs
        .readFileSync(path.join(root, 'tv', 'tizen', 'config.xml'), 'utf-8')
        .replace(/version="0\.0\.0"/, `version="${version}"`)
        .replace(/id="XstrmPlyr0\.XStreamPlayer"/, `id="${TIZEN_APP.appId}"`)
        .replace(/package="XstrmPlyr0"/, `package="${TIZEN_APP.pkg}"`)
        .replace(/<name>XStream Player<\/name>/, `<name>${TIZEN_APP.name}</name>`);

    fs.writeFileSync(path.join(staging, 'config.xml'), config);

    run('tizen', ['build-web', '--', staging]);
    run('tizen', ['package', '--type', 'wgt', '--', path.join(staging, '.buildResult')]);

    for (const file of fs.readdirSync(path.join(staging, '.buildResult'))) {
        if (file.endsWith('.wgt')) {
            fs.copyFileSync(
                path.join(staging, '.buildResult', file),
                path.join(distDir, file),
            );
        }
    }
}

console.log(`[package:tv] packaging ${platform} client v${version}${isDev ? ' (dev)' : ''}`);
stagePayload();

if (platform === 'webos') {
    packageWebos();
} else {
    packageTizen();
}

fs.rmSync(staging, { recursive: true, force: true });
console.log(`[package:tv] done → ${path.relative(root, distDir)}/`);
