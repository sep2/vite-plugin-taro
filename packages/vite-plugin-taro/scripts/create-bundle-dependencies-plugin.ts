import { createRequire } from 'node:module'
import path from 'node:path'
import type { Plugin } from 'rolldown'

/** Specializes bundled dependencies without changing Node resolution for the rest of the plugin. */
export function createBundleDependenciesPlugin(packageRoot: string): Plugin {
    const packageRequire = createRequire(path.join(packageRoot, 'package.json'))
    // RxJS puts its CommonJS `node` export before its ESM exports. Select the equivalent ESM build so
    // Rolldown can discard unused operators, schedulers and transports instead of retaining the whole barrel.
    const rxjsEntry = path.join(path.dirname(packageRequire.resolve('rxjs/package.json')), 'dist/esm/index.js')
    const stubPrefix = '\0vpt:mini-style-stub:'
    const dependencyStubs: Readonly<Record<string, string>> = {
        autoprefixer: `export default function unavailable() { throw new Error('VPT disables Mini Program autoprefixer') }`,
        'postcss-load-config': `export default function unavailable() { throw new Error('VPT owns Mini Program PostCSS configuration') }`,
        'tailwindcss-config': `export function loadConfig() { throw new Error('VPT compiles Tailwind before Mini Program PostCSS') }`,
        // cssCalc is false; the other calculator callers are exclusive to uni-app x and Lynx, not weapp-vite.
        '@weapp-tailwindcss/postcss-calc': `export default function unavailable() { throw new Error('VPT disables Mini Program CSS calculation') }`
    }

    return {
        name: 'vpt:bundle-dependencies',
        options(options) {
            return {
                ...options,
                // The dependency eagerly creates an unused default handler with Autoprefixer enabled. Its factory owns only
                // local caches and plugins, so discard unused calls while retaining VPT's configured, consumed handler.
                // This plugin owns compiler-build specialization; application builds never receive this purity declaration.
                treeshake: { manualPureFunctions: ['createStyleHandler'] }
            }
        },
        resolveId(id) {
            if (id === 'rxjs') {
                return rxjsEntry
            }
            return Object.hasOwn(dependencyStubs, id) ? `${stubPrefix}${id}` : undefined
        },
        load(id) {
            return id.startsWith(stubPrefix) ? dependencyStubs[id.slice(stubPrefix.length)] : undefined
        }
    }
}
