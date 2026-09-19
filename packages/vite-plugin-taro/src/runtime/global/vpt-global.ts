// Type-only declaration: the fallback lookup stays free so the inherited getter receives the real host global.
declare const __vpt_global__: typeof globalThis

/** Use the native object when available; otherwise recover it with the ungap/global-this getter technique. */
function getGlobalThis(this: typeof globalThis | void): typeof globalThis {
    // This file must not have any raw reference to the `globalThis` free binding,
    // Otherwise it creates a circular dependency because rolldown inject globalThis import from this file.
    // This native probe is restored in an isolated output entry after globalThis injection.
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
    // Both paths assign this local result so the return follows cleanup, avoiding an unreachable V8 coverage branch.
    let resolved: typeof globalThis

    try {
        Object.defineProperty(Object.prototype, '__vpt_global__', {
            get(this: typeof globalThis | undefined) {
                return this || self
            },
            configurable: true
        })

        resolved = __vpt_global__
    } catch (cause) {
        // Hosts may prohibit prototype changes with preventExtensions, seal, or freeze.
        console.error('Unable to resolve globalThis', cause)

        const fakeGlobal = {
            [Symbol('fallback')]: cause
        }

        resolved = fakeGlobal as unknown as typeof globalThis
    } finally {
        delete (Object.prototype as { __vpt_global__?: typeof globalThis }).__vpt_global__
    }

    return resolved
}

/** One shared host object. */
export const vptGlobal = getGlobalThis()
