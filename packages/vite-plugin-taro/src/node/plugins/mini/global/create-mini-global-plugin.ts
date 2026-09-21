import path from 'node:path'
import { build, type OutputOptions, type RenderedChunk } from 'rolldown'
import { type Plugin, transformWithOxc } from 'vite'
import { esTarget } from '../../../utils/constant.ts'
import { memoize } from '../../../utils/memoize.ts'
import { createExactModuleIdFilter } from '../../../utils/modules.ts'
import { resolveRuntimeFile } from '../../../utils/packages.ts'
import { rolldownRuntimeId, vptGlobalBindingId } from '../module/module.ts'
import type { MiniPlacementPlugin } from '../placer/placer.ts'

const vptGlobalSrcFile = resolveRuntimeFile('global/vpt-global')
const vptGlobalDistFile = 'common/vpt/global.js'

/** Shares one standalone native provider between the application's virtual binding and the wrapped HMR runtime. */
export function createMiniGlobalPlugin(placement: Pick<MiniPlacementPlugin, 'getPhysicalChunkId'>): Plugin[] {
    function getGlobalReference(chunk: RenderedChunk): string {
        // Insert the physical edge only after linking. A source-level require would pull discovery back into HMR.
        // Placement has already assigned the caller's path; the provider always lives in the main package.
        const relative = path.posix.relative(path.posix.dirname(placement.getPhysicalChunkId(chunk)), vptGlobalDistFile)
        const reference = relative.startsWith('.') ? relative : `./${relative}`
        return `require(${JSON.stringify(reference)}).vptGlobal`
    }

    return [
        {
            name: 'vpt:mini-global',
            resolveId: {
                filter: { id: createExactModuleIdFilter(vptGlobalBindingId) },
                handler() {
                    return vptGlobalBindingId
                }
            },
            load: {
                filter: { id: createExactModuleIdFilter(vptGlobalBindingId) },
                handler() {
                    return 'export const vptGlobal = __VPT_GLOBAL__;'
                }
            },
            config() {
                return {
                    build: {
                        rolldownOptions: {
                            transform: {
                                inject: {
                                    globalThis: [vptGlobalBindingId, 'vptGlobal']
                                }
                            }
                        }
                    }
                }
            },
            renderChunk: {
                order: 'pre',
                filter: { code: /__VPT_GLOBAL__/ },
                handler(code, chunk, options) {
                    if (!chunk.moduleIds.includes(vptGlobalBindingId) && !chunk.moduleIds.includes(rolldownRuntimeId)) {
                        return
                    }

                    return transformWithOxc(code, chunk.fileName, {
                        define: { __VPT_GLOBAL__: getGlobalReference(chunk) },
                        sourcemap: Boolean(options.sourcemap)
                    })
                }
            },
            generateBundle: {
                order: 'post',
                async handler(options) {
                    // Emit after placement/rendering, not as an input: this file must never enter the application or HMR graph.
                    // Only the binding participates in SystemJS transport and HMR's module registry.
                    // Normalized minifier settings contain internal targets, not reusable input options. Discovery follows
                    // the enabled/disabled choice and the same ES target as the rest of the Mini output.
                    const result = await bundleGlobal({
                        dir: options.dir,
                        minify: options.minify !== false,
                        sourcemap: options.sourcemap
                    })

                    for (const output of result.output) {
                        if (output.type === 'asset') {
                            this.emitFile({ type: 'asset', fileName: output.fileName, source: output.source })
                        } else {
                            this.emitFile({
                                type: 'prebuilt-chunk',
                                fileName: output.fileName,
                                code: output.code,
                                exports: output.exports,
                                facadeModuleId: vptGlobalSrcFile,
                                isEntry: true
                            })
                        }
                    }
                }
            }
        },
        {
            name: 'vpt:mini-global-dev',
            apply: 'serve',
            renderChunk: {
                order: 'pre',
                filter: { code: /__rolldown_runtime__/ },
                handler(code, chunk) {
                    // The owner assigns its local cell once, after constructing the runtime. Other chunks capture the same
                    // App-lifetime singleton after their static dependencies initialize; generated calls stay untouched.
                    const binding = chunk.moduleIds.includes(rolldownRuntimeId)
                        ? 'let __rolldown_runtime__;\n'
                        : `const __rolldown_runtime__ = ${getGlobalReference(chunk)}.__rolldown_runtime__;\n`

                    // Mini development disables source maps. Ordinary chunks need only a prefix, not another AST pass.
                    return { code: binding + code, map: null }
                }
            }
        }
    ]
}

// Cache immutable output by its rendering options, including the directory used for relative source-map paths. Complete
// development rebuilds reuse the same Promise without adding another watcher or reevaluating discovery in the HMR graph.
const bundleGlobal = memoize(
    (output: Pick<OutputOptions, 'dir' | 'minify' | 'sourcemap'>) =>
        build({
            input: vptGlobalSrcFile,
            transform: { target: esTarget },
            output: {
                ...output,
                format: 'cjs',
                // iOS may invoke the inherited global-name getter with an undefined receiver. Only this standalone
                // provider allows non-strict receiver conversion; application chunks retain their own strictness.
                strict: false,
                // Discovery supports a missing Symbol constructor; export metadata must not access it first.
                generatedCode: { symbols: false },
                entryFileNames: vptGlobalDistFile
            },
            write: false
        }),
    { getCacheKey: (output) => JSON.stringify(output) }
)
