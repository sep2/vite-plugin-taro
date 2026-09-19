import path from 'node:path'
import { build, type OutputOptions } from 'rolldown'
import { type Plugin, transformWithOxc } from 'vite'
import { esTarget } from '../../../utils/constant.ts'
import { memoize } from '../../../utils/memoize.ts'
import { createExactModuleIdFilter } from '../../../utils/modules.ts'
import { resolveRuntimeFile } from '../../../utils/packages.ts'
import { rolldownRuntimeId, vptGlobalBindingId } from '../module/module.ts'
import type { MiniPlacementPlugin } from '../placer/placer.ts'

const vptGlobalSrcFile = resolveRuntimeFile('global/vpt-global')
const vptGlobalDistFile = 'common/vpt-global.js'

/** Shares one standalone native provider between the application's virtual binding and the wrapped HMR runtime. */
export function createMiniGlobalPlugin(placement: Pick<MiniPlacementPlugin, 'getPhysicalChunkId'>): Plugin {
    return {
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

                // Insert the physical edge only after linking. A source-level require would pull discovery back into HMR.
                // Placement has already assigned the caller's path; the provider always lives in the main package.
                const relative = path.posix.relative(
                    path.posix.dirname(placement.getPhysicalChunkId(chunk)),
                    vptGlobalDistFile
                )
                const reference = relative.startsWith('.') ? relative : `./${relative}`

                return transformWithOxc(code, chunk.fileName, {
                    define: { __VPT_GLOBAL__: `require(${JSON.stringify(reference)}).vptGlobal` },
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
    }
}

// Cache immutable output by its rendering options, including the directory used for relative source-map paths. Complete
// development rebuilds reuse the same Promise without adding another watcher or reevaluating discovery in the HMR graph.
const bundleGlobal = memoize(
    (output: Pick<OutputOptions, 'dir' | 'minify' | 'sourcemap'>) =>
        build({
            input: vptGlobalSrcFile,
            transform: { target: esTarget },
            // Preserve ESM receiver and cleanup semantics even when the host's CommonJS wrapper is not strict.
            output: {
                ...output,
                format: 'cjs',
                strict: true,
                // Discovery supports a missing Symbol constructor; export metadata must not access it first.
                generatedCode: { symbols: false },
                entryFileNames: vptGlobalDistFile
            },
            write: false
        }),
    { getCacheKey: (output) => JSON.stringify(output) }
)
