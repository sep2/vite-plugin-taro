type GlobalThisType = typeof globalThis

// Type-only declaration: the fallback lookup stays free so the inherited getter receives the real host global.
declare const __vpt_global__: GlobalThisType

/** Use the native object when available; otherwise recover it with the ungap/global-this getter technique. */
function getGlobalThis(this: GlobalThisType | void): GlobalThisType {
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
    let resolved: GlobalThisType

    try {
        Object.defineProperty(Object.prototype, '__vpt_global__', {
            get(this: GlobalThisType | undefined) {
                return this || self
            },
            configurable: true
        })

        resolved = __vpt_global__
    } catch (cause) {
        console.error('Unable to resolve globalThis', cause)
        resolved = getOrCreateFakeGlobal()
    } finally {
        delete (Object.prototype as { __vpt_global__?: GlobalThisType }).__vpt_global__
    }

    return resolved
}

function getOrCreateFakeGlobal(): GlobalThisType {
    // Separately bundled copies share one mutable fallback through this realm's Object constructor, not its possibly
    // locked prototype. The non-enumerable, immutable cache slot is created only after the first failed discovery.
    const key =
        typeof Symbol === 'function' && typeof Symbol.for === 'function'
            ? Symbol.for('vpt.fake.global')
            : 'vpt.fake.global'

    const cached: GlobalThisType | undefined = Reflect.get(Object, key)
    if (cached) {
        return cached
    }

    const fakeGlobal = {
        Object: Object
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    } as any

    fakeGlobal.globalThis = fakeGlobal

    Object.defineProperty(Object, key, { value: fakeGlobal })

    return fakeGlobal as unknown as GlobalThisType
}

/**
 * One shared host object.
 * This must be same instance even if the file is copied.
 * */
export const vptGlobal = getGlobalThis()
