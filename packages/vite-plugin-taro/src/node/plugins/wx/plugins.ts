import type { Plugin, PluginOption } from 'vite'
import type { VitePluginTaroOptions } from '../../../options.ts'
import { esTarget } from '../../utils/constant.ts'
import { packageRequire } from '../../utils/packages.ts'
import { clientTaroNativeId } from '../client/constant.ts'
import { createWxDevelopmentPlugin } from './dev/plugins.ts'
import { getWxExecutionKind, isTransportModule } from './module.ts'
import { compileNativeComponentInterface } from './native/compile-native-component-interface.ts'
import { getNativeComponentAssetBytes } from './native/native-component-assets.ts'
import { createOutputFiles } from './output/files.ts'
import { createPlacer } from './placement/placer.ts'
import { renderCapsule } from './render/capsule.ts'
import { renderNative } from './render/native.ts'
import { materializeTransport } from './render/transport.ts'
import { createResolver } from './resolve/resolver.ts'
import { createWxStylePlugins } from './styles/plugins.ts'

type WxResolver = ReturnType<typeof createResolver>

/** Creates the complete plugin set for the wx target. */
export function createWxTargetPlugins(options: VitePluginTaroOptions): PluginOption[] {
    const resolver = createResolver(options)

    // Reuse the resolver instance's ordered application subset. Rolldown's complete input also contains bootstrap, transport,
    // shell, and component entries; entry membership alone cannot recover which roots define the App/Page CSS cascade.
    return [
        createWxStylePlugins(),
        createWxPlugin(options, resolver),
        createWxDevelopmentPlugin(options, resolver.applicationEntryIds)
    ]
}

/** Configures the complete wx target build pipeline. */
function createWxPlugin(options: VitePluginTaroOptions, resolver: WxResolver): Plugin {
    const placer = createPlacer()

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
                        ...placer.rolldownOptions,
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

        renderStart() {
            placer.analyze({
                moduleIds: this.getModuleIds(),
                getModuleInfo: (moduleId) => this.getModuleInfo(moduleId),
                getAdditionalModuleBytes: (info) => getNativeComponentAssetBytes(info.meta)
            })
        },

        renderChunk: {
            order: 'post',
            async handler(code, chunk, outputOptions, meta) {
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
                        getLoadMode: placer.getLoadMode,
                        sourcemap
                    })
                }

                return native
            }
        },

        generateBundle: {
            /*
             * This hook is registered after createWxStylePlugins() and shares hook-level `order: 'post'` with the adapted
             * upstream hooks and VPT style finalizer. Registration order therefore guarantees that the imported global
             * stylesheet is complete before native Page/component companions are emitted. Without this order, the finalizer
             * could consume incomplete Tailwind output or mistake native WXSS companions for additional compiler styles.
             */
            order: 'post',
            async handler(_, bundle) {
                const subpackages = placer.getSubpackages(bundle)

                const outputFiles = await createOutputFiles({
                    bundle,
                    options,
                    subpackages,
                    getModuleInfo: (moduleId) => this.getModuleInfo(moduleId)
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
