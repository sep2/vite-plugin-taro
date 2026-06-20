import path from 'node:path'

/**
 * Derives a page component import from a Taro-style page path.
 *
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/plugins/MiniPlugin.ts#L660-L668
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/utils/app.ts#L74-L90
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-loader/src/h5.ts#L12-L21
 */
export function createPageComponentImport(pagePath: string): string {
    return toImportPath(`src/${pagePath}.tsx`)
}

/**
 * Converts a local file path into an absolute ESM import path for Vite.
 */
export function toImportPath(filePath: string): string {
    return path.resolve(filePath)
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
