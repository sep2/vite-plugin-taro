// Type-only declaration: the fallback lookup stays free so the inherited getter receives the real host global.
declare const __vpt_global__: typeof globalThis

/** Use the native object when available; otherwise recover it with the ungap/global-this getter technique. */
function getGlobalThis(this: typeof globalThis | void): typeof globalThis {
    if (typeof __VPT_NATIVE_GLOBAL_THIS__ === 'object' && __VPT_NATIVE_GLOBAL_THIS__) {
        return __VPT_NATIVE_GLOBAL_THIS__
    }

    // worker
    if (typeof self === 'object' && self) {
        return self
    }

    // browser
    if (typeof window === 'object' && window) {
        return window
    }

    if (typeof this === 'object' && this) {
        return this
    }

    // https://mathiasbynens.be/notes/globalthis
    // This fallback requires a host that inherits Object.prototype and permits its temporary modification.
    // Separate error translation from cleanup to avoid V8's unreachable catch-to-finally coverage branch.
    try {
        try {
            Object.defineProperty(Object.prototype, '__vpt_global__', {
                get(this: typeof globalThis | undefined) {
                    return this || self
                },
                configurable: true
            })

            return __vpt_global__
        } catch (cause) {
            // Hosts may prohibit prototype changes with preventExtensions, seal, or freeze.
            throw new Error('Unable to resolve globalThis', { cause })
        }
    } finally {
        delete (Object.prototype as { __vpt_global__?: typeof globalThis }).__vpt_global__
    }
}

/** One object shared by application, polyfill, and runtime modules. This module is excluded from globalThis injection. */
export const vptGlobal = getGlobalThis()
