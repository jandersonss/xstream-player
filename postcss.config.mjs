import path from 'node:path';

// Turbopack (`next dev`) evaluates this config from a copy under `.next/`, so
// both a project-relative plugin path and one derived from `import.meta.url`
// resolve against that directory and fail with MODULE_NOT_FOUND. Webpack
// (`next build --webpack`) resolves against the project root, which is why only
// dev broke. `process.cwd()` is the project root under both.
const tvLegacyPlugin = path.join(process.cwd(), 'postcss', 'postcss-tv-legacy.cjs');

/** @type {import('postcss-load-config').Config} */
const config = {
    plugins: {
        tailwindcss: {},
        autoprefixer: {},
        // Down-levels `inset` shorthand and prefixes `backdrop-filter` for the
        // webOS 5/6 TV engines. Must run last, after Tailwind emits and
        // autoprefixer has had its pass. See the file header for the why.
        [tvLegacyPlugin]: {},
    },
};

export default config;
