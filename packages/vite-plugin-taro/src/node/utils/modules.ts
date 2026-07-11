/** Node-side helpers for application module files, Vite import specifiers, and normalized module IDs. */
import path from 'node:path'

/**
 * Derives a page component import from a Taro-style page path.
 *
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/plugins/MiniPlugin.ts#L660-L668
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/utils/app.ts#L74-L90
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-loader/src/h5.ts#L12-L21
 */
export function createPageComponentImportPath(pagePath: string): string {
    return toViteFileImportPath(createPageComponentFile(pagePath))
}

/**
 * Resolves the source file backing a Taro-style page path.
 */
function createPageComponentFile(pagePath: string): string {
    return path.resolve(`src/${pagePath}.tsx`)
}

/**
 * Converts a local file path into a Vite file-system import specifier.
 *
 * Rolldown does not reliably resolve raw Windows absolute paths from virtual
 * module source, so generated imports use Vite's /@fs/ prefix instead.
 */
export function toViteFileImportPath(filePath: string): string {
    return `/@fs/${normalizeModuleId(path.resolve(filePath))}`
}

/**
 * Removes Rollup/Vite's internal virtual-module prefix before ID comparisons.
 */
export function stripVirtualPrefix(id: string): string {
    return id.startsWith('\0') ? id.slice(1) : id
}

/**
 * Uses Taro-style slash normalization, plus Vite query-string stripping for module IDs.
 *
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-helper/src/utils.ts#L32-L34
 */
export function normalizeModuleId(id: string): string {
    return id.replace(/\\/g, '/').replace(/\?.*$/, '')
}
