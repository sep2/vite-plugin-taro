import { type Plugin, transformWithOxc } from 'vite'
import { createExactModuleIdFilter } from '../../../utils/modules.ts'
import { packageRequire } from '../../../utils/packages.ts'
import type { MiniContract } from '../mini-contract.ts'
import { isMiniPolyfillModule, miniPolyfillsId } from '../module/module.ts'
import { miniBrowserBindings } from './mini-browser-bindings.ts'

// Core-js probes the host, not Taro's emulated DOM. Explicit global accesses also keep its pre-bootstrap graph independent
// of the framework capsule when Rolldown later injects renderer bindings into application and dependency modules.
const polyfillHostBindings = Object.fromEntries(
    Object.keys(miniBrowserBindings).map((name) => [name, `globalThis.${name}`])
)

/** Loads a standalone polyfills entry before bootstrap and retains Taro's renderer bindings. */
export function createMiniPolyfillPlugin(contract: Pick<MiniContract, 'options'>): Plugin {
    const polyfills = [...new Set(contract.options.polyfills ?? [])]

    return {
        name: 'vpt:mini-polyfills',
        config() {
            return {
                build: {
                    rolldownOptions: {
                        input: { polyfills: miniPolyfillsId },
                        transform: { inject: miniBrowserBindings }
                    }
                }
            }
        },
        transform(code, id) {
            if (!isMiniPolyfillModule(id)) {
                return
            }
            return transformWithOxc(code, id, { define: polyfillHostBindings, sourcemap: true })
        },
        resolveId: {
            filter: { id: createExactModuleIdFilter(miniPolyfillsId) },
            handler() {
                return miniPolyfillsId
            }
        },
        load: {
            filter: { id: createExactModuleIdFilter(miniPolyfillsId) },
            handler() {
                return polyfills.map((id) => `import ${JSON.stringify(resolvePolyfillModule(id))};`).join('\n')
            }
        }
    }
}

/** Accepts core-js module names only, not package entry points, paths, or browser-target inference. */
function resolvePolyfillModule(name: string): string {
    if (!/^[a-z][a-z\d]*(?:[.-][a-z\d]+)*$/.test(name)) {
        throw new Error(
            `Invalid core-js polyfill module: ${JSON.stringify(name)}. Use a module name such as "web.url".`
        )
    }
    try {
        return packageRequire.resolve(`core-js/modules/${name}.js`)
    } catch (cause) {
        throw new Error(`Unknown core-js polyfill module: ${JSON.stringify(name)}.`, { cause })
    }
}
