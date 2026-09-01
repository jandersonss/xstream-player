/** @type {import('postcss-load-config').Config} */
const config = {
    plugins: {
        tailwindcss: {},
        autoprefixer: {},
        // Down-levels `inset` shorthand and prefixes `backdrop-filter` for the
        // webOS 5/6 TV engines. Must run last, after Tailwind emits and
        // autoprefixer has had its pass. See the file header for the why.
        './postcss/postcss-tv-legacy.cjs': {},
    },
};

export default config;
