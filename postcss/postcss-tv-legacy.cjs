/**
 * Down-levels a few modern CSS constructs that Tailwind/autoprefixer leave in the
 * bundle but the target TV engines cannot parse. Runs last (see postcss.config.mjs).
 *
 * Target floor: the modern app is served down to Chromium 53 (webOS 4's packaged
 * container; middleware.ts `MODERN_APP_MIN_CHROME`). webOS 5 ≈ Chromium 68,
 * webOS 6 ≈ Chromium 79. Handled here:
 *
 *   1. `inset` shorthand (Chromium 87) — Tailwind's `inset-0` etc. emit it; an
 *      unparsed `inset` silently drops positioning, collapsing every
 *      `absolute inset-0` layer (hero background, gradient scrims, overlays) to 0×0.
 *
 *   2. Space-separated `rgb()/hsl()` functional notation with `/` alpha
 *      (`rgb(255 255 255/.1)`) — CSS Color 4, Chromium 66. Tailwind 3.4 emits this
 *      for every `*-white/10`, `bg-black/60`, opacity-modified color and gradient
 *      stop. Below Chromium 66 the whole declaration is invalid: a `border-color`
 *      falls back to `currentColor`, so every subtle `border-white/10` divider
 *      renders as a solid bright line ("app looks like a wireframe"). Rewritten to
 *      legacy `rgba()/hsla()` comma form, which every engine accepts (and which
 *      cssnano keeps as-is here — Next runs it with `colormin: false`).
 *
 *   3. `backdrop-filter` without the `-webkit-` prefix (Chromium 76).
 */

/** Expand a 1–4 value `inset` shorthand into physical longhands. */
function expandInset(value) {
    const parts = value.trim().split(/\s+/);
    if (parts.length < 1 || parts.length > 4) return null;
    const [top, right = top, bottom = top, left = right] = parts;
    return { top, right, bottom, left };
}

// `rgb(` / `rgba(` / `hsl(` / `hsla(` followed by three space-separated components
// and an optional `/ alpha`. Legacy comma syntax (commas between components) never
// matches because the lookahead requires whitespace, not a comma.
const MODERN_COLOR = /\b(rgba?|hsla?)\(\s*([^)/,]+?)\s*(?:\/\s*([^)]+?))?\s*\)/gi;

function toLegacyColors(value) {
    if (value.indexOf('(') === -1) return value;
    return value.replace(MODERN_COLOR, (match, fn, body, alpha) => {
        // Only the space-separated form: bail out if it already uses commas.
        if (body.indexOf(',') !== -1) return match;
        const parts = body.split(/\s+/).filter(Boolean);
        if (parts.length !== 3) return match;
        const base = fn.replace(/a$/i, '');
        if (alpha === undefined) return `${base}(${parts.join(', ')})`;
        return `${base}a(${parts.join(', ')}, ${alpha.trim()})`;
    });
}

module.exports = () => ({
    postcssPlugin: 'postcss-tv-legacy',
    Declaration(decl) {
        if (decl.prop === 'inset') {
            const sides = expandInset(decl.value);
            if (sides) {
                decl.replaceWith(
                    { prop: 'top', value: sides.top },
                    { prop: 'right', value: sides.right },
                    { prop: 'bottom', value: sides.bottom },
                    { prop: 'left', value: sides.left },
                );
                return;
            }
        }

        if (decl.prop === 'backdrop-filter') {
            const prev = decl.prev();
            if (!prev || prev.prop !== '-webkit-backdrop-filter') {
                decl.cloneBefore({ prop: '-webkit-backdrop-filter' });
            }
        }

        if (/rgba?\(|hsla?\(/i.test(decl.value)) {
            const next = toLegacyColors(decl.value);
            if (next !== decl.value) decl.value = next;
        }
    },
});

module.exports.postcss = true;
