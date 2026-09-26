import type { Plugin, PluginOption } from 'vite'
import { esTarget } from '../../utils/constant.ts'
import { createExactModuleIdFilter } from '../../utils/modules.ts'
import { packageRequire, resolveTaroRuntime } from '../../utils/packages.ts'
import type { AstTransformResult } from '../../utils/transform.ts'
import { createMiniDevelopmentPlugin } from './dev/plugins.ts'
import { createMiniGlobalPlugin } from './global/create-mini-global-plugin.ts'
import type { MiniContract } from './mini-contract.ts'
import { classifyMiniModule, miniAppCapsuleId, miniPageCapsuleId, miniTaroRuntimeId } from './module/module.ts'
import { createMiniNativeComponentPlugin } from './native/create-mini-native-component-plugin.ts'
import { createTransportOutput } from './output/create-transport-output.ts'
import { createOutputFiles } from './output/files.ts'
import { createMiniPlacementPlugin, type MiniPlacementPlugin } from './placer/placer.ts'
import { createMiniPolyfillPlugin } from './polyfill/create-mini-polyfill-plugin.ts'
import { renderCapsule } from './render/capsule.ts'
import { renderNative } from './render/native.ts'
import { createResolver } from './resolve/resolver.ts'
import { createMiniStylePlugin } from './styles/plugins.ts'
import { createMiniWatchPlugin } from './watch/create-mini-watch-plugin.ts'

type MiniResolver = ReturnType<typeof createResolver>

/** Creates the complete Mini Program plugin set. */
export function createMiniTargetPlugins(contract: MiniContract): PluginOption[] {
    const resolver = createResolver(contract)

    // Reuse the resolver instance's ordered application subset. Rolldown's complete input also contains bootstrap,
    // shell, and component entries; entry membership alone cannot recover which roots define the App/Page CSS cascade.
    const placement = createMiniPlacementPlugin()
    const styles = createMiniStylePlugin(contract, resolver.applicationEntryIds)

    return [
        placement,
        styles,
        createMiniPlugin(contract, resolver, placement),
        createMiniNativeComponentPlugin(),
        createMiniPolyfillPlugin(contract),
        createMiniGlobalPlugin(placement),
        createMiniDevelopmentPlugin(contract, styles),
        createMiniWatchPlugin(contract)
    ]
}

/** Configures the complete Mini Program target build pipeline. */
function createMiniPlugin(contract: MiniContract, resolver: MiniResolver, placement: MiniPlacementPlugin): Plugin {
    return {
        name: 'vpt:mini',

        config() {
            return {
                define: createTaroDefines(contract.taro.env),

                appType: 'custom',

                oxc: { target: esTarget },

                resolve: {
                    alias: [
                        {
                            find: /^@tarojs\/plugin-framework-react\/dist\/runtime$/,
                            replacement: resolveTaroRuntime('plugin-framework-react/runtime')
                        },
                        {
                            find: /^@tarojs\/runtime$/,
                            replacement: miniTaroRuntimeId
                        },
                        {
                            find: /^@tarojs\/api$/,
                            replacement: resolveTaroRuntime('api')
                        },
                        {
                            // The typed shared facade and upstream imports select the same Mini component table.
                            find: /^(?:@tarojs|vite-plugin-taro-runtime)\/components$/,
                            replacement: contract.taro.componentsReactPath
                        }
                    ]
                },

                build: {
                    modulePreload: false,
                    // Mini Program styles are intentionally global. This guarantees one compiler stylesheet for the CSS
                    // finalizer; enabling splitting would require Page ownership and must not be silently flattened.
                    cssCodeSplit: false,

                    // No base64 assets: Taro warns on image srcs above ~2KB, and inlined
                    // images bloat the JS bundle toward the mini program package limit.
                    assetsInlineLimit: 0,

                    target: esTarget,

                    rolldownOptions: {
                        // The dedicated Mini placement plugin owns output naming and entry-signature semantics. This plugin owns
                        // only the closed named input set of native shells, lifecycle capsules, and bootstrap entries.
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
            filter: {
                id: [miniAppCapsuleId, miniPageCapsuleId].map(createExactModuleIdFilter)
            },
            handler(code, id) {
                return resolver.specialize(code, id, Boolean(this.environment.config.build.sourcemap))
            }
        },

        renderChunk: {
            order: 'post',
            handler(code, chunk, outputOptions, meta): AstTransformResult {
                // The placement plugin runs first and has already created immutable placement from this complete chunk graph.

                const kind = classifyMiniModule(chunk)
                const sourcemap = Boolean(outputOptions.sourcemap)

                switch (kind) {
                    case 'entry-capsule':
                    case 'normal-capsule': {
                        return renderCapsule(code, chunk, sourcemap)
                    }
                    case 'native':
                    case 'amphibious': {
                        // Native and amphibious modules share the CommonJS renderer
                        return renderNative({
                            code,
                            chunk,
                            chunks: meta.chunks,
                            getPhysicalChunkId: placement.getPhysicalChunkId,
                            sourcemap
                        })
                    }
                }
            }
        },

        generateBundle: {
            /*
             * Registration after the style pipeline makes the compiler stylesheet final before native Page and component
             * companions are emitted. The style finalizer therefore cannot mistake native platform styles for application CSS.
             */
            order: 'post',
            async handler(_, bundle) {
                // LTHP joins OutputChunks to their preliminary logical IDs and assigns Rolldown-owned physical filenames.
                // createOutputFiles then observes those paths to relocate native component folders, emit placeholders, and
                // declare only surviving package roots in app.json. The standalone global provider is emitted separately
                // after this hook; it has no graph edges, native components, or subpackage ownership to plan.
                const subpackages = placement.getSubpackages()

                // Emit after minification so native loaders always receive quoted literal paths, without a repair pass.
                this.emitFile(createTransportOutput({ bundle, getPackageLocation: placement.getPackageLocation }))

                const outputFiles = await createOutputFiles({
                    bundle,
                    contract,
                    subpackages,
                    isProduction: this.environment.config.isProduction,
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

/** Creates the build-time constants required by Taro and React feature gates. */
function createTaroDefines(taroEnv: string): Record<string, string> {
    const taroVersion = String(
        (packageRequire('vite-plugin-taro-runtime/taro/package.json') as { version: string }).version
    )

    return {
        'process.env.FRAMEWORK': JSON.stringify('react'),
        'process.env.SUPPORT_TARO_POLYFILL': JSON.stringify('disabled'),
        'process.env.TARO_ENV': JSON.stringify(taroEnv),
        'process.env.TARO_PLATFORM': JSON.stringify('mini'),
        'process.env.TARO_VERSION': JSON.stringify(taroVersion),
        // These implementations already ship in Taro; false makes the bundler erase their installation branches.
        // Enable them together: insertAdjacentHTML is nested under the innerHTML gate. This is Taro's Mini DOM, not a
        // browser emulator (notably, element measurements are asynchronous). Legacy Object/Array polyfills above remain
        // disabled: enabling DOM methods does not require replacing modern JavaScript primitives.
        ENABLE_ADJACENT_HTML: 'true',
        ENABLE_CLONE_NODE: 'true',
        ENABLE_CONTAINS: 'true',
        ENABLE_INNER_HTML: 'true',
        ENABLE_MUTATION_OBSERVER: 'true',
        ENABLE_SIZE_APIS: 'true',
        ENABLE_TEMPLATE_CONTENT: 'true'
    }
}
