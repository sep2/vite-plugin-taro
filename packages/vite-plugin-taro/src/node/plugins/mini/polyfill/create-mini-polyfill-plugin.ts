import { RolldownMagicString } from 'rolldown'
import type { Plugin } from 'vite'
import { createExactModuleIdFilter } from '../../../utils/modules.ts'
import { packageRequire } from '../../../utils/packages.ts'
import type { MiniContract } from '../mini-contract.ts'
import { miniBrowserBindings } from './mini-browser-bindings.ts'

/** Adds selected core-js imports to bootstrap and retains Taro's renderer bindings. */
export function createMiniPolyfillPlugin(contract: Pick<MiniContract, 'options' | 'runtime'>): Plugin {
    const polyfills = (contract.options.polyfills ?? []).map(resolvePolyfillModule)

    return {
        name: 'vpt:mini-polyfills',
        config() {
            return {
                build: {
                    rolldownOptions: {
                        transform: { inject: miniBrowserBindings }
                    }
                }
            }
        },
        transform: {
            order: 'post',
            filter: { id: createExactModuleIdFilter(contract.runtime.modules.bootstrap) },
            handler(code, id) {
                // Mini development needs queueMicrotask for React Refresh; production includes it only if selected.
                const modules =
                    this.environment.config.command === 'serve'
                        ? [resolvePolyfillModule('web.queue-microtask'), ...polyfills]
                        : polyfills

                const imports = [...new Set(modules)].map((id) => `import ${JSON.stringify(id)};`).join('\n')

                if (!imports) {
                    return
                }

                // This local editor only shifts the original runtime source; user source mappings remain owned by Vite.
                const editor = new RolldownMagicString(code, { filename: id })
                editor.prepend(`${imports}\n`)

                return {
                    code: editor.toString(),
                    map: this.environment.config.build.sourcemap
                        ? JSON.stringify(editor.generateMap({ hires: 'boundary', includeContent: true }))
                        : null
                }
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
