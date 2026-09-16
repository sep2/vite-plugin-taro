/** One mutable namespace per module instance, shared by every importer without replacing an available native global. */
export const miniGlobal: object = typeof globalThis === 'undefined' ? {} : globalThis

// Only initialize a missing self-reference; leave the native global's existing property unchanged.
if (Reflect.get(miniGlobal, 'globalThis') !== miniGlobal) {
    Object.defineProperty(miniGlobal, 'globalThis', {
        value: miniGlobal,
        configurable: true,
        writable: true
    })
}
