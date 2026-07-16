/** Resolves dependencies and package-owned files relative to the installed plugin rather than the user project. */
import { createRequire } from 'node:module'
import path from 'node:path'

export const packageRequire = createRequire(import.meta.url)
const packageRoot = path.dirname(packageRequire.resolve('vite-plugin-taro/package.json'))

/**
 * Resolves emitted plugin-owned runtime files from the installed package root rather than the application root.
 * Joining from `vite-plugin-taro/package.json` keeps H5 runtime imports stable under pnpm and nested installations.
 */
export function resolvePackageFile(...segments: string[]): string {
    return path.join(packageRoot, ...segments)
}
