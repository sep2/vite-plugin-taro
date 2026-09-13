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
        'tailwindcss-config': `export function loadConfig() { throw new Error('VPT compiles Tailwind before Mini Program PostCSS') }`
    }

    return {
        name: 'vpt:bundle-dependencies',
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
