import type { Plugin, PluginOption } from 'vite'
import type { VptOptions } from '../../../options.ts'
import { esTarget } from '../../utils/constant.ts'
import { packageRequire } from '../../utils/packages.ts'
import { clientTaroNativeId } from '../client/constant.ts'
import { createWxDevelopmentPlugin } from './dev/plugins.ts'
import { getWxExecutionKind, isTransportModule } from './module/module.ts'
import { compileNativeComponentInterface } from './native/compile-native-component-interface.ts'
import { createOutputFiles } from './output/files.ts'
import { createWxPlacementPlugin, type WxPlacementPlugin } from './placer/placer.ts'
import { renderCapsule } from './render/capsule.ts'
import { renderNative } from './render/native.ts'
import { materializeTransport } from './render/transport.ts'
import { createResolver } from './resolve/resolver.ts'
import { createWxStylePlugin } from './styles/plugins.ts'

type WxResolver = ReturnType<typeof createResolver>

/** Creates the complete plugin set for the wx target. */
export function createWxTargetPlugins(options: VptOptions): PluginOption[] {
    const resolver = createResolver(options)

    // Reuse the resolver instance's ordered application subset. Rolldown's complete input also contains bootstrap, transport,
    // shell, and component entries; entry membership alone cannot recover which roots define the App/Page CSS cascade.
    const placement = createWxPlacementPlugin()
    const styles = createWxStylePlugin(resolver.applicationEntryIds)

    return [placement, styles, createWxPlugin(options, resolver, placement), createWxDevelopmentPlugin(options, styles)]
}

/** Configures the complete wx target build pipeline. */
function createWxPlugin(options: VptOptions, resolver: WxResolver, placement: WxPlacementPlugin): Plugin {
    return {
        name: 'vpt:wx',

        config(_config, _env) {
            return {
                define: createTaroDefines(),

                appType: 'custom',

                oxc: { target: esTarget },

                resolve: {
                    alias: [
                        {
                            find: /^@tarojs\/components$/,
                            replacement: packageRequire.resolve('@tarojs/plugin-platform-weapp/dist/components-react')
                        }
                    ]
                },

                build: {
                    modulePreload: false,
                    // Mini Program styles are intentionally global. This guarantees one compiler stylesheet for the CSS
                    // finalizer; enabling splitting would require Page ownership and must not be silently flattened.
                    cssCodeSplit: false,
                    // Preserve readable source for the final WX compatibility pass; browser minification can emit syntax
                    // unsupported by WeChat and would make the subsequent whole-file conversion harder to reason about.
                    cssMinify: false,

                    // No base64 assets: Taro warns on image srcs above ~2KB, and inlined
                    // images bloat the JS bundle toward the mini program package limit.
                    assetsInlineLimit: 0,

                    target: esTarget,

                    rolldownOptions: {
                        // The dedicated vpt:wx-placer plugin owns output naming and entry-signature semantics. This plugin owns
                        // only the closed named input set of native shells, lifecycle capsules, bootstrap, and transport entries.
                        input: resolver.input
                    }
                }
            }
        },

        resolveId(id, importer) {
            return resolver.resolveId(id, importer, this.environment.config.root)
        },

        transform: {
            order: 'pre',
            async handler(code, id) {
                const sourcemap = Boolean(this.environment.config.build.sourcemap)

                if (code.includes(clientTaroNativeId)) {
                    return compileNativeComponentInterface({
                        code,
                        id,
                        sourcemap,
                        addWatchFile: (file) => this.addWatchFile(file)
                    })
                }

                return resolver.specialize(code, id, sourcemap)
            }
        },

        renderChunk: {
            order: 'post',
            async handler(code, chunk, outputOptions, meta) {
                // vpt:wx-placer runs first and has already created immutable placement from this complete chunk graph.

                const executionKind = getWxExecutionKind(chunk)
                const sourcemap = Boolean(outputOptions.sourcemap)

                if (executionKind === 'capsule') {
                    return renderCapsule(code, chunk, sourcemap)
                }

                // Native and amphibious modules share the CommonJS renderer. Amphibious transport exposure is a
                // separate concern materialized from final output paths after the physical transport itself is rendered.
                const native = renderNative({ code, chunk, chunks: meta.chunks, sourcemap })

                if (isTransportModule(chunk)) {
                    return materializeTransport({
                        code: native.code,
                        transportChunk: chunk,
                        chunks: meta.chunks,
                        getLoadMode: placement.getLoadMode,
                        getPhysicalChunkId: placement.getPhysicalChunkId,
                        sourcemap
                    })
                }

                return native
            }
        },

        generateBundle: {
            /*
             * Registration after the style pipeline makes the compiler stylesheet final before native Page and component
             * companions are emitted. The style finalizer therefore cannot mistake native WXSS for application CSS.
             */
            order: 'post',
            async handler(_, bundle) {
                // LTHP joins OutputChunks to their preliminary logical IDs and assigns Rolldown-owned physical filenames.
                // createOutputFiles then observes those paths to relocate native component folders, emit placeholders, and
                // declare only surviving package roots in app.json. No JavaScript chunk is manually emitted or copied.
                const subpackages = placement.getSubpackages()

                const outputFiles = await createOutputFiles({
                    bundle,
                    options,
                    subpackages,
                    getModuleInfo: (moduleId) => this.getModuleInfo(moduleId),
                    getPackageLocation: placement.getPackageLocation
                })

                outputFiles.forEach((file) => {
                    this.emitFile(file)
                })
            }
        }
    }
}

/** Creates the build-time constants required by Taro's legacy feature gates. */
function createTaroDefines(): Record<string, string> {
    const taroVersion = String((packageRequire('@tarojs/runtime/package.json') as { version: string }).version)

    return {
        'process.env.FRAMEWORK': JSON.stringify('react'),
        'process.env.SUPPORT_TARO_POLYFILL': JSON.stringify('disabled'),
        'process.env.TARO_ENV': JSON.stringify('weapp'),
        'process.env.TARO_PLATFORM': JSON.stringify('mini'),
        'process.env.TARO_VERSION': JSON.stringify(taroVersion),
        // React's development-only Suspense diagnostics call this browser API without guards.
        'performance.now': 'Date.now',
        ENABLE_ADJACENT_HTML: 'false',
        ENABLE_CLONE_NODE: 'false',
        ENABLE_CONTAINS: 'false',
        ENABLE_INNER_HTML: 'false',
        ENABLE_MUTATION_OBSERVER: 'false',
        ENABLE_SIZE_APIS: 'false',
        ENABLE_TEMPLATE_CONTENT: 'false'
    }
}
