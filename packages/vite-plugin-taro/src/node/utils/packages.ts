import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizePath } from 'vite'

export const packageRequire = createRequire(import.meta.url)
const packageRoot = path.dirname(packageRequire.resolve('vite-plugin-taro/package.json'))
const runtimeLocations = {
    '.ts': { root: 'src/runtime', extension: '.ts' },
    '.js': { root: 'dist/runtime', extension: '.js' }
} as const
const runtimeLocation = runtimeLocations[path.extname(fileURLToPath(import.meta.url)) as keyof typeof runtimeLocations]

/** Resolves a file shipped by this package as a portable Vite module ID. */
export function resolvePackageFile(...segments: string[]): string {
    return normalizePath(path.join(packageRoot, ...segments))
}

/** Resolves an unbundled browser runtime module from source in the workspace and from dist after publication. */
export function resolveRuntimeFile(modulePath: string): string {
    return resolvePackageFile(runtimeLocation.root, `${modulePath}${runtimeLocation.extension}`)
}
