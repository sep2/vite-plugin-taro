import 'systemjs/s.js'

declare function __VITE_PLUGIN_TARO_NATIVE_REQUIRE__(id: './transport.js'): Pick<System.Loader, 'instantiate'>

/** Resolves relative output chunk IDs without browser URL APIs. */
function resolve(specifier: string, parentId?: string): string {
    if (!specifier.startsWith('.')) {
        return specifier
    }

    if (!parentId) {
        throw new Error(`Cannot resolve ${specifier} without a parent module`)
    }

    const segments = parentId.split('/').slice(0, -1)

    for (const segment of specifier.split('/')) {
        if (!segment || segment === '.') {
            continue
        }
        if (segment !== '..') {
            segments.push(segment)
            continue
        }
        if (segments.length === 0) {
            throw new Error(`Module path escapes the output root: ${specifier}`)
        }
        segments.pop()
    }
    return segments.join('/')
}

System.resolve = resolve
System.instantiate = __VITE_PLUGIN_TARO_NATIVE_REQUIRE__('./transport.js').instantiate
