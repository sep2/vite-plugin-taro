import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizePath } from 'vite'

export const packageRequire = createRequire(import.meta.url)

/** Resolves a public export of the bundled Taro runtime package. */
export function resolveTaroRuntime(subpath: string): string {
    return packageRequire.resolve(`vite-plugin-taro-runtime/${subpath}`)
}

const packageRoot = path.dirname(packageRequire.resolve('vite-plugin-taro/package.json'))

const vptRuntimeLocations = {
    '.ts': { root: 'src/runtime', extension: '.ts' },
    '.js': { root: 'dist/runtime', extension: '.js' }
} as const

const vptRuntimeLocation =
    vptRuntimeLocations[path.extname(fileURLToPath(import.meta.url)) as keyof typeof vptRuntimeLocations]

/** Resolves an unbundled browser runtime module from source in the workspace and from dist after publication. */
export function resolveVptRuntime(modulePath: string): string {
    return normalizePath(
        path.join(packageRoot, vptRuntimeLocation.root, `${modulePath}${vptRuntimeLocation.extension}`)
    )
}
