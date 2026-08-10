import { createRequire } from 'node:module'
import path from 'node:path'
import { normalizePath } from 'vite'

export const packageRequire = createRequire(import.meta.url)
const packageRoot = path.dirname(packageRequire.resolve('vite-plugin-taro/package.json'))

/** Resolves a file shipped by this package as a portable Vite module ID. */
export function resolvePackageFile(...segments: string[]): string {
    return normalizePath(path.join(packageRoot, ...segments))
}
