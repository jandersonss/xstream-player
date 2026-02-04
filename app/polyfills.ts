/**
 * Polyfills for older browsers (specifically WebOS 4 / Chrome 60)
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

    // ResizeObserver no-op polyfill (Chrome 64+)
    // Some libraries like framer-motion might need this to avoid crashing
    if (typeof (window as any).ResizeObserver === 'undefined') {
        (window as any).ResizeObserver = class ResizeObserver {
            observe() { }
            unobserve() { }
            disconnect() { }
        };
    }

    // IntersectionObserver polyfill check (Chrome 51+)
    // WebOS 4 should have it, but just in case
    if (typeof (window as any).IntersectionObserver === 'undefined') {
        (window as any).IntersectionObserver = class IntersectionObserver {
            observe() { }
            unobserve() { }
            disconnect() { }
        };
    }

    // Array.prototype.flat polyfill (Chrome 69+)
    if (!Array.prototype.flat) {
        (Array.prototype as any).flat = function (depth = 1) {
            return this.reduce((flat: any, toFlatten: any) => {
                return flat.concat((Array.isArray(toFlatten) && (depth > 1)) ? toFlatten.flat(depth - 1) : toFlatten);
            }, []);
        };
    }

    // AbortController polyfill (Chrome 66+)
    if (typeof (window as any).AbortController === 'undefined') {
        (window as any).AbortController = class AbortController {
            signal = { aborted: false, addEventListener: () => { }, removeEventListener: () => { } };
            abort() { this.signal.aborted = true; }
        };
    }

    // On-screen Error Logger for debugging on TV
    window.addEventListener('error', function (event) {
        const errorDiv = document.createElement('div');
        errorDiv.style.position = 'fixed';
        errorDiv.style.top = '0';
        errorDiv.style.left = '0';
        errorDiv.style.width = '100%';
        errorDiv.style.background = 'rgba(255,0,0,0.8)';
        errorDiv.style.color = 'white';
        errorDiv.style.padding = '10px';
        errorDiv.style.zIndex = '9999';
        errorDiv.style.fontSize = '12px';
        errorDiv.innerText = 'Error: ' + event.message + ' at ' + event.filename + ':' + event.lineno;
        document.body.appendChild(errorDiv);
        console.error('Captured on-screen error:', event);
    });

    // Handle Unhandled Promise Rejections
    window.addEventListener('unhandledrejection', function (event) {
        const errorDiv = document.createElement('div');
        errorDiv.style.position = 'fixed';
        errorDiv.style.bottom = '0';
        errorDiv.style.left = '0';
        errorDiv.style.width = '100%';
        errorDiv.style.background = 'rgba(255,165,0,0.8)';
        errorDiv.style.color = 'black';
        errorDiv.style.padding = '10px';
        errorDiv.style.zIndex = '9999';
        errorDiv.style.fontSize = '12px';
        errorDiv.innerText = 'Promise Rejection: ' + (event.reason ? event.reason.message : 'Unknown');
        document.body.appendChild(errorDiv);
        console.error('Captured on-screen rejection:', event);
    });

    // Check for IndexedDB
    if (!window.indexedDB) {
        console.error("IndexedDB is not supported in this browser.");
    }
}
