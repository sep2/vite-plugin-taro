import { type Plugin, transformWithOxc } from 'vite'
import { createExactModuleIdFilter } from '../../../utils/modules.ts'
import { packageRequire } from '../../../utils/packages.ts'
import type { MiniContract } from '../mini-contract.ts'
import { miniPolyfillSourceFilter, miniPolyfillsId, vptGlobalId } from '../module/module.ts'
import { miniBrowserBindings } from './mini-browser-bindings.ts'

// Core-js probes the host, not Taro's emulated DOM. Explicit global accesses also keep its pre-bootstrap graph independent
// of the framework capsule when Rolldown later injects renderer bindings into application and dependency modules.
const polyfillHostBindings = Object.fromEntries(
    Object.keys(miniBrowserBindings).map((name) => [name, `globalThis.${name}`])
)

/** Loads standalone global/polyfill entries before bootstrap and retains Taro's renderer bindings. */
export function createMiniPolyfillPlugin(contract: Pick<MiniContract, 'options'>): Plugin {
    const polyfills = [...new Set(contract.options.polyfills ?? [])]

    return {
        name: 'vpt:mini-polyfills',
        config() {
            return {
                build: {
                    rolldownOptions: {
                        input: { 'vpt-global': vptGlobalId, polyfills: miniPolyfillsId },
                        transform: {
                            inject: {
                                ...miniBrowserBindings,
                                globalThis: [vptGlobalId, 'vptGlobal']
                            }
                        }
                    }
                }
            }
        },
        transform: {
            filter: {
                id: miniPolyfillSourceFilter,
                // A backslash admits escaped identifier spellings too. False positives are harmless: Oxc still owns
                // lexical binding semantics; this precheck only excludes modules that cannot reference a host binding.
                code: new RegExp(`\\\\|\\b(?:${Object.keys(miniBrowserBindings).join('|')})\\b`)
            },
            handler(code, id) {
                return transformWithOxc(code, id, {
                    define: polyfillHostBindings,
                    sourcemap: Boolean(this.environment.config.build.sourcemap)
                })
            }
        },
        renderChunk: {
            order: 'pre',
            handler(code, chunk, outputOptions) {
                if (chunk.facadeModuleId !== vptGlobalId) {
                    return
                }
                // Injection has finished. Placement isolates this entry from application bindings, so the native probe
                // cannot import itself or capture a user's local globalThis. Only this constant-size runtime is reparsed.
                return transformWithOxc(code, chunk.fileName, {
                    define: { __VPT_NATIVE_GLOBAL_THIS__: 'globalThis' },
                    sourcemap: Boolean(outputOptions.sourcemap)
                })
            }
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
