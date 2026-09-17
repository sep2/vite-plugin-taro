/** One mutable namespace shared by transformed modules on targets without native globalThis. Native targets do not import it. */
export const miniGlobal: object = {}

// Match the ordinary globalThis property's writable, configurable, non-enumerable self-reference without probing host names.
Object.defineProperty(miniGlobal, 'globalThis', {
    value: miniGlobal,
    configurable: true,
    writable: true
})
