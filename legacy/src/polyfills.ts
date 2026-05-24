const root = (typeof window !== 'undefined' ? window : self) as typeof window & Record<string, unknown>;

if (typeof root.globalThis === 'undefined') {
    root.globalThis = root;
}

if (typeof root.Symbol === 'undefined') {
    const registry: Record<string, string> = {};
    let counter = 0;
    const symbolFactory = function Symbol(description?: string) {
        counter += 1;
        return `@@symbol:${description || ''}:${counter}`;
    };
    symbolFactory.for = function symbolFor(key: string) {
        registry[key] = registry[key] || `@@symbol:${key}`;
        return registry[key];
    };
    root.Symbol = symbolFactory;
}

if (typeof root.requestAnimationFrame === 'undefined') {
    root.requestAnimationFrame = function requestAnimationFramePolyfill(callback: FrameRequestCallback) {
        return window.setTimeout(() => callback(Date.now()), 16);
    };
}

if (typeof root.cancelAnimationFrame === 'undefined') {
    root.cancelAnimationFrame = function cancelAnimationFramePolyfill(id: number) {
        window.clearTimeout(id);
    };
}

if (typeof root.queueMicrotask === 'undefined') {
    root.queueMicrotask = function queueMicrotaskPolyfill(callback: () => void) {
        Promise.resolve().then(callback);
    };
}

if (typeof Promise !== 'undefined' && !Promise.prototype.finally) {
    Promise.prototype.finally = function legacyFinally(callback: () => void) {
        const promiseConstructor = this.constructor as PromiseConstructor;
        return this.then(
            value => promiseConstructor.resolve(callback()).then(() => value),
            reason => promiseConstructor.resolve(callback()).then(() => { throw reason; })
        );
    };
}

if (!Object.assign) {
    Object.assign = function legacyAssign(target: object, ...sources: object[]) {
        const output = Object(target) as Record<string, unknown>;
        for (let i = 0; i < sources.length; i++) {
            const source = sources[i] as Record<string, unknown> | null | undefined;
            if (!source) continue;
            const keys = Object.keys(source);
            for (let j = 0; j < keys.length; j++) {
                output[keys[j]] = source[keys[j]];
            }
        }
        return output;
    };
}

if (!Array.prototype.find) {
    Array.prototype.find = function legacyFind<T>(predicate: (value: T, index: number, obj: T[]) => boolean) {
        for (let i = 0; i < this.length; i++) {
            if (predicate(this[i], i, this)) return this[i];
        }
        return undefined;
    };
}
