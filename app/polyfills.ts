/* eslint-disable @typescript-eslint/no-explicit-any -- patching built-ins means
   assigning onto globals whose lib.dom types do not admit a hand-written
   implementation; `any` is the only workable escape hatch here. */

/**
 * Runtime polyfills for the oldest TV browser the modern app targets:
 * LG webOS 4 / Chromium 53.
 *
 * Syntax is handled by the compiler (the `browserslist` field in package.json
 * drives the SWC downlevel). This file only covers *runtime APIs* that
 * Chromium 53 never shipped, which fail lazily — the screen that calls them
 * throws, the rest of the app looks fine.
 *
 * Next.js ships its own small polyfill bundle (`next/dist/build/polyfills/
 * polyfill-module`) with the app-router client entry. It already covers
 * String#trimStart/trimEnd, Symbol#description, Array#flat/flatMap,
 * Promise#finally, Object.fromEntries, Array#at, Object.hasOwn and
 * URL.canParse — but *not* Object.entries/values (Chrome 54), String#padStart/
 * padEnd (57), queueMicrotask (71), AbortController (66) or structuredClone
 * (98), which is why they are repeated/added here. Overlapping entries are
 * kept because load order between the two bundles is not guaranteed, and every
 * definition below is feature-checked first.
 *
 * **This file is not imported by the app.** `npm run build:polyfills` compiles it
 * to `public/polyfills-legacy.js`, and `app/layout.tsx` inlines that output as the
 * very first script on the page.
 *
 * The ordering is the whole point. Shipping these through the client bundle (as a
 * client component, or any import) makes them run at hydration — *after* the
 * vendor chunks evaluate. On webOS 4 that is too late: a vendor chunk touches
 * `globalThis` at module scope and throws `ReferenceError` before React ever
 * mounts, leaving a black screen. An inline script runs before every bundle.
 */

if (typeof window !== 'undefined') {
    // Promise.prototype.finally polyfill (Chrome 63+)
    if (!Promise.prototype.finally) {
        (Promise.prototype as any).finally = function (callback: any) {
            const P = this.constructor;
            return this.then(
                (value: any) => P.resolve(callback()).then(() => value),
                (reason: any) => P.resolve(callback()).then(() => { throw reason; })
            );
        };
    }

    // Object.entries polyfill (Chrome 54+)
    // One version above the Chromium 53 floor, so it is missing on webOS 4.
    // Used by hls.js (CMCD) and by the Next.js client runtime.
    if (!Object.entries) {
        (Object as any).entries = function (target: any) {
            const keys = Object.keys(Object(target));
            const result: any[] = [];
            for (let i = 0; i < keys.length; i++) {
                result.push([keys[i], (target as any)[keys[i]]]);
            }
            return result;
        };
    }

    // Object.values polyfill (Chrome 54+)
    if (!Object.values) {
        (Object as any).values = function (target: any) {
            const keys = Object.keys(Object(target));
            const result: any[] = [];
            for (let i = 0; i < keys.length; i++) {
                result.push((target as any)[keys[i]]);
            }
            return result;
        };
    }

    // Object.fromEntries polyfill (Chrome 73+)
    if (!Object.fromEntries) {
        Object.fromEntries = function (entries: any) {
            if (!entries || !entries[Symbol.iterator]) {
                throw new Error('Object.fromEntries() requires a single iterable argument');
            }
            const obj: any = {};
            for (const [key, value] of entries) {
                obj[key] = value;
            }
            return obj;
        };
    }

    // globalThis polyfill (Chrome 71+)
    if (typeof (window as any).globalThis === 'undefined') {
        (window as any).globalThis = window;
    }

    // queueMicrotask polyfill (Chrome 71+)
    // framer-motion calls it unguarded when a motion component mounts, so
    // without this every animated screen throws a ReferenceError.
    if (typeof (window as any).queueMicrotask !== 'function') {
        (window as any).queueMicrotask = function (callback: any) {
            Promise.resolve().then(callback).catch((error: any) => {
                // The spec reports a throwing microtask as an uncaught error
                // instead of an unhandled rejection.
                setTimeout(() => { throw error; }, 0);
            });
        };
    }

    // ResizeObserver no-op polyfill (Chrome 64+)
    // A real implementation would need per-element size polling; this stub only
    // keeps libraries that construct one from crashing. Consequence: callbacks
    // NEVER fire, so anything that depends on being told an element resized
    // (layout measured after a resize) stays at its first measured value.
    if (typeof (window as any).ResizeObserver === 'undefined') {
        (window as any).ResizeObserver = class ResizeObserver {
            observe() { }
            unobserve() { }
            disconnect() { }
        };
    }

    // IntersectionObserver fallback (Chrome 51+)
    // Chromium 53 does ship it, so this stub should never be installed. If it
    // ever is, callbacks never fire: infinite scroll stops after the first
    // batch, which is why the lists keep a "carregar mais" button as fallback.
    if (typeof (window as any).IntersectionObserver === 'undefined') {
        (window as any).IntersectionObserver = class IntersectionObserver {
            observe() { }
            unobserve() { }
            disconnect() { }
        };
    }

    // Array.prototype.flat polyfill (Chrome 69+)
    if (!Array.prototype.flat) {
        (Array.prototype as any).flat = function (depth?: number) {
            const requested = depth === undefined ? 1 : Number(depth);
            const maxDepth = Number.isNaN(requested) ? 0 : requested;
            const result: any[] = [];
            const step = (source: any[], remaining: number) => {
                for (let i = 0; i < source.length; i++) {
                    // Holes are dropped, like the native implementation.
                    if (!(i in source)) continue;
                    const value = source[i];
                    if (remaining > 0 && Array.isArray(value)) {
                        step(value, remaining - 1);
                    } else {
                        result.push(value);
                    }
                }
            };
            step(Object(this), maxDepth);
            return result;
        };
    }

    // Array.prototype.flatMap polyfill (Chrome 69+)
    // Defined independently of `flat` on purpose: Next's polyfill bundle only
    // defines flatMap inside its `!Array.prototype.flat` branch, so once flat
    // exists (natively or from the block above) its flatMap is never installed.
    if (!Array.prototype.flatMap) {
        (Array.prototype as any).flatMap = function (callback: any, thisArg?: any) {
            const mapped = Array.prototype.map.call(Object(this), callback, thisArg);
            return (mapped as any).flat(1);
        };
    }

    // Array.prototype.at polyfill (Chrome 92+)
    if (!Array.prototype.at) {
        (Array.prototype as any).at = function (index: number) {
            const len = this.length;
            const relativeIndex = index >= 0 ? index : len + index;
            if (relativeIndex < 0 || relativeIndex >= len) return undefined;
            return this[relativeIndex];
        };
    }

    // String.prototype.padStart / padEnd polyfill (Chrome 57+)
    // Used by the player's time formatting ("01:05") and by the TV Mode modal.
    if (!String.prototype.padStart) {
        (String.prototype as any).padStart = function (targetLength: number, padString?: string) {
            const self = String(this);
            const target = Math.floor(Number(targetLength)) || 0;
            const filler = padString === undefined ? ' ' : String(padString);
            if (target <= self.length || filler === '') return self;
            let pad = '';
            while (pad.length < target - self.length) pad += filler;
            return pad.slice(0, target - self.length) + self;
        };
    }

    if (!String.prototype.padEnd) {
        (String.prototype as any).padEnd = function (targetLength: number, padString?: string) {
            const self = String(this);
            const target = Math.floor(Number(targetLength)) || 0;
            const filler = padString === undefined ? ' ' : String(padString);
            if (target <= self.length || filler === '') return self;
            let pad = '';
            while (pad.length < target - self.length) pad += filler;
            return self + pad.slice(0, target - self.length);
        };
    }

    // String.prototype.replaceAll polyfill (Chrome 85+)
    if (!String.prototype.replaceAll) {
        (String.prototype as any).replaceAll = function (search: string | RegExp, replace: any) {
            if (search instanceof RegExp) {
                if (!search.global) {
                    throw new TypeError('String.prototype.replaceAll called with a non-global RegExp argument');
                }
                return this.replace(search, replace);
            }
            // Delegating to replace() with an escaped global RegExp keeps the
            // `$&`/`$1` substitution patterns and function replacers working,
            // which a split()/join() implementation would silently drop.
            const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return this.replace(new RegExp(escaped, 'g'), replace);
        };
    }

    // AbortController / AbortSignal polyfill (Chrome 66+)
    // IMPORTANT: this cannot actually cancel a request. Chromium 53's fetch()
    // has no `signal` init member and ignores it, and XMLHttpRequest is not
    // wired to signals either — so an in-flight download keeps running to
    // completion. What this restores is the observable contract (`aborted`,
    // `reason`, `onabort`, abort listeners, `throwIfAborted`), which is what
    // React's cache and app code that re-checks `signal.aborted` after an
    // await rely on to stop *reacting* to a stale response.
    if (typeof (window as any).AbortController === 'undefined') {
        const createAbortError = (): any => {
            try {
                return new (window as any).DOMException('The operation was aborted.', 'AbortError');
            } catch {
                const error: any = new Error('The operation was aborted.');
                error.name = 'AbortError';
                return error;
            }
        };

        class PolyfilledAbortSignal {
            aborted = false;
            reason: any = undefined;
            onabort: any = null;
            private listeners: any[] = [];

            addEventListener(type: string, listener: any) {
                if (type === 'abort' && listener) this.listeners.push(listener);
            }

            removeEventListener(type: string, listener: any) {
                if (type !== 'abort') return;
                const index = this.listeners.indexOf(listener);
                if (index >= 0) this.listeners.splice(index, 1);
            }

            throwIfAborted() {
                if (this.aborted) throw this.reason;
            }

            /** Internal: fired by the owning controller. */
            _abort(reason: any) {
                if (this.aborted) return;
                this.aborted = true;
                this.reason = reason === undefined ? createAbortError() : reason;
                const event = { type: 'abort', target: this };
                const listeners = this.listeners.slice();
                this.listeners.length = 0;
                if (typeof this.onabort === 'function') this.onabort(event);
                for (let i = 0; i < listeners.length; i++) {
                    const listener = listeners[i];
                    if (typeof listener === 'function') listener(event);
                    else if (listener && typeof listener.handleEvent === 'function') listener.handleEvent(event);
                }
            }
        }

        (window as any).AbortSignal = PolyfilledAbortSignal;
        (window as any).AbortController = class AbortController {
            signal = new PolyfilledAbortSignal();
            abort(reason?: any) {
                (this.signal as any)._abort(reason);
            }
        };
    }

    // structuredClone polyfill (Chrome 98+)
    // Required by Next.js 16+ internals. Handles cycles, Date, RegExp, Map, Set
    // and plain objects/arrays. Not covered (returned by reference instead of
    // cloned, unlike the real algorithm): ArrayBuffer/TypedArray, Blob, File,
    // ImageData and other platform objects. Functions are returned as-is
    // instead of throwing DataCloneError.
    if (typeof (window as any).structuredClone === 'undefined') {
        (window as any).structuredClone = function structuredClone(value: any) {
            const seen = new WeakMap();
            const clone = (input: any): any => {
                if (input === null || typeof input !== 'object') return input;
                if (seen.has(input)) return seen.get(input);

                if (input instanceof Date) return new Date(input.getTime());
                if (input instanceof RegExp) return new RegExp(input.source, input.flags);

                if (Array.isArray(input)) {
                    const copy: any[] = [];
                    seen.set(input, copy);
                    for (let i = 0; i < input.length; i++) copy[i] = clone(input[i]);
                    return copy;
                }

                if (input instanceof Map) {
                    const copy = new Map();
                    seen.set(input, copy);
                    input.forEach((entryValue, entryKey) => copy.set(clone(entryKey), clone(entryValue)));
                    return copy;
                }

                if (input instanceof Set) {
                    const copy = new Set();
                    seen.set(input, copy);
                    input.forEach((entryValue) => copy.add(clone(entryValue)));
                    return copy;
                }

                const copy: any = {};
                seen.set(input, copy);
                const keys = Object.keys(input);
                for (let i = 0; i < keys.length; i++) copy[keys[i]] = clone(input[keys[i]]);
                return copy;
            };
            return clone(value);
        };
    }

    // crypto.randomUUID polyfill (Chrome 92+)
    // Backed by crypto.getRandomValues (Chrome 11+), so the ids stay random
    // rather than falling back to Math.random. hls.js calls it unguarded inside
    // a try/catch, and app/lib/device.ts uses it for the device id.
    const cryptoRef: any = (window as any).crypto;
    if (cryptoRef && typeof cryptoRef.getRandomValues === 'function' && typeof cryptoRef.randomUUID !== 'function') {
        cryptoRef.randomUUID = function randomUUID() {
            const bytes = new Uint8Array(16);
            cryptoRef.getRandomValues(bytes);
            // Version 4 and RFC 4122 variant bits.
            bytes[6] = (bytes[6] & 0x0f) | 0x40;
            bytes[8] = (bytes[8] & 0x3f) | 0x80;
            const hex: string[] = [];
            for (let i = 0; i < bytes.length; i++) {
                hex.push((bytes[i] + 0x100).toString(16).slice(1));
            }
            return (
                hex.slice(0, 4).join('') + '-' +
                hex.slice(4, 6).join('') + '-' +
                hex.slice(6, 8).join('') + '-' +
                hex.slice(8, 10).join('') + '-' +
                hex.slice(10, 16).join('')
            );
        };
    }


}

