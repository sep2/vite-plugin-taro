import type { Plugin, PluginOption } from 'vite'
import { esTarget } from '../../utils/constant.ts'
import { createExactModuleIdFilter } from '../../utils/modules.ts'
import { packageRequire, resolveTaroRuntime } from '../../utils/packages.ts'
import type { AstTransformResult } from '../../utils/transform.ts'
import { resolvePages } from '../page/resolve-pages.ts'
import { createMiniDevelopmentPlugin } from './dev/plugins.ts'
import { createMiniGlobalPlugin } from './global/create-mini-global-plugin.ts'
import type { MiniContract } from './mini-contract.ts'
import {
    appShellFileName,
    classifyMiniModule,
    componentShellFileName,
    customWrapperShellFileName,
    miniAppCapsuleId,
    miniAppShellId,
    miniBootstrapId,
    miniComponentCapsuleId,
    miniComponentShellId,
    miniCustomWrapperShellId,
    miniPageCapsuleId,
    miniTaroRuntimeId
} from './module/module.ts'
import { createMiniNativeComponentPlugin } from './native/create-mini-native-component-plugin.ts'
import { createTransportOutput } from './output/create-transport-output.ts'
import { createOutputFiles } from './output/files.ts'
import { createMiniOverridePlugin } from './override/create-mini-override-plugin.ts'
import { createMiniPlacementPlugin, type MiniPlacementPlugin } from './placer/placer.ts'
import { createMiniPolyfillPlugin } from './polyfill/create-mini-polyfill-plugin.ts'
import { renderCapsule } from './render/capsule.ts'
import { renderNative } from './render/native.ts'
import { createResolver } from './resolve/resolver.ts'
import { createMiniStylePlugin, type MiniStylePlugin } from './styles/plugins.ts'
import { createMiniWatchPlugin } from './watch/create-mini-watch-plugin.ts'

type MiniResolver = ReturnType<typeof createResolver>

/** Creates the complete Mini Program plugin set. */
export function createMiniTargetPlugins(contract: MiniContract): PluginOption[] {
    const placement = createMiniPlacementPlugin(contract.automaticSubpackages)

    const styles = createMiniStylePlugin(contract)

    return [
        placement,
        styles,
        createMiniPlugin(contract, placement, styles),
        createMiniNativeComponentPlugin(),
        createMiniPolyfillPlugin(contract),
        createMiniGlobalPlugin(placement),
        createMiniDevelopmentPlugin(contract, styles),
        createMiniWatchPlugin(contract),
        createMiniOverridePlugin(contract)
    ]
}

/** Configures the complete Mini Program target build pipeline. */
function createMiniPlugin(
    contract: MiniContract,
    placement: MiniPlacementPlugin,
    styles: Pick<MiniStylePlugin, 'bindEntries'>
): Plugin {
    // Each App load installs the current resolver before emitting dependent entries for build and serve.
    let resolver: MiniResolver

    return {
        name: 'vpt:mini',
        config() {
            return {
                define: {
                    ...createTaroDefines(contract.taro.env),
                    ...contract.define
                },

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
                    // Native Mini Program files are not served with HTTP gzip; reporting compressed sizes wastes build time.
                    reportCompressedSize: false,
                    modulePreload: false,
                    // No base64 assets: Taro warns on image srcs above ~2KB, and inlined
                    // images bloat the JS bundle toward the mini program package limit.
                    assetsInlineLimit: 0,

                    target: esTarget,

                    rolldownOptions: {
                        input: { [appShellFileName]: miniAppShellId }
                    }
                }
            }
        },

        /** Binds stylesheet roots to the current graph before each complete output, including cached App loads. */
        renderStart() {
            return styles.bindEntries(this, resolver)
        },

        /** The App shell owns all other entries, including replay from the bundler's module cache. */
        load: {
            filter: { id: createExactModuleIdFilter(miniAppShellId) },
            async handler() {
                const config = this.environment.config
                const pages = await resolvePages({
                    pages: contract.options.pages,
                    target: contract.options.target,
                    root: config.root,
                    define: config.define,
                    resolve: config.resolve
                })
                resolver = createResolver(contract, pages)

                // Rolldown allocates the shared runtime filename; native entry paths remain fixed.
                this.emitFile({ type: 'chunk', id: miniBootstrapId, name: 'bootstrap' })
                this.emitFile({
                    type: 'chunk',
                    id: resolver.appEntry.capsuleId,
                    fileName: `${resolver.appEntry.capsuleName}.js`
                })
                this.emitFile({ type: 'chunk', id: miniComponentShellId, fileName: componentShellFileName })
                this.emitFile({ type: 'chunk', id: miniComponentCapsuleId, fileName: 'component-capsule.js' })
                this.emitFile({ type: 'chunk', id: miniCustomWrapperShellId, fileName: customWrapperShellFileName })
                for (const entry of resolver.pageEntries) {
                    this.emitFile({ type: 'chunk', id: entry.shellId, fileName: entry.shellName })
                    this.emitFile({ type: 'chunk', id: entry.capsuleId, fileName: `${entry.capsuleName}.js` })
                }
            }
        },

        resolveId(id, importer) {
            // The fixed App shell resolves before its load establishes the private module graph.
            return resolver?.resolveId(id, importer, this.environment.config.root)
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
                    pages: resolver.pageEntries.map((entry) => entry.page),
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
