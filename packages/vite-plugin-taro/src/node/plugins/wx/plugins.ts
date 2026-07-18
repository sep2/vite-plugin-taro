import type { Plugin, PluginOption } from 'vite'
import type { VitePluginTaroOptions } from '../../../options.ts'
import { packageRequire } from '../../utils/packages.ts'
import { createAppConfig } from '../../utils/project-config.ts'
import { generateBundle } from './bundle/generate-bundle.ts'
import { renderCapsule } from './capsule/render-capsule.ts'
import { isNativeModule, isTransportModule } from './native/is-native-module.ts'
import { renderNativeModule } from './native/render-native-module.ts'
import { createPlacer } from './placer/placer.ts'
import { createModuleResolver } from './resolver/module-resolver.ts'
import { materializeTransport } from './transport/materialize-transport.ts'

const wxJavaScriptTarget = 'es2018'

/** Creates the WX target plugins. */
export function createWxTargetPlugins(options: VitePluginTaroOptions): PluginOption[] {
    return [createWxTargetPlugin(options)]
}

/** Configures the wx target. */
function createWxTargetPlugin(options: VitePluginTaroOptions): Plugin {
    const moduleResolver = createModuleResolver(options)
    const placer = createPlacer()

    return {
        name: 'vite-plugin-taro:wx',

        config(_config, _env) {
            return {
                define: createWxDefines(options),

                appType: 'custom',

                oxc: { target: wxJavaScriptTarget },

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
                    cssCodeSplit: false,
                    // Let weapp-tailwindcss own final WXSS transformation.
                    cssMinify: false,

                    target: wxJavaScriptTarget,

                    rolldownOptions: {
                        input: moduleResolver.input,
                        output: {
                            entryFileNames: placer.entryFileNames,
                            chunkFileNames: placer.chunkFileNames,
                            assetFileNames(asset) {
                                if (asset.names.some((name) => name.endsWith('.css'))) {
                                    return 'app.wxss'
                                }

                                return 'assets/[name]-[hash][extname]'
                            }
                        },
                        preserveEntrySignatures: 'strict'
                    }
                }
            }
        },

        resolveId(id, importer) {
            return moduleResolver.resolveId(id, importer, this.environment.config.root)
        },

        transform: {
            order: 'pre',
            handler(code, id) {
                return moduleResolver.transform(code, id, this.environment.config.root)
            }
        },

        renderChunk: {
            order: 'post',
            async handler(code, chunk, _outputOptions, meta) {
                if (!isNativeModule(chunk)) {
                    return renderCapsule(code, chunk)
                }

                const nativeModule = renderNativeModule(code, chunk)
                if (!isTransportModule(chunk)) {
                    return nativeModule
                }

                return materializeTransport({
                    code: nativeModule.code,
                    transportChunk: chunk,
                    chunks: meta.chunks,
                    getLoadMode: placer.getLoadMode
                })
            }
        },

        generateBundle: {
            order: 'post',
            handler(_, bundle) {
                const files = generateBundle(bundle, options)

                files.forEach((file) => {
                    this.emitFile(file)
                })
            }
        }
    }
}

/** Creates WX compile-time constants. */
function createWxDefines(options: VitePluginTaroOptions): Record<string, string> {
    const taroVersion = String((packageRequire('@tarojs/runtime/package.json') as { version: string }).version)

    return {
        __VITE_PLUGIN_TARO_APP_CONFIG__: JSON.stringify(createAppConfig(options)),
        'process.env.FRAMEWORK': JSON.stringify('react'),
        'process.env.SUPPORT_TARO_POLYFILL': JSON.stringify('disabled'),
        'process.env.TARO_ENV': JSON.stringify('weapp'),
        'process.env.TARO_PLATFORM': JSON.stringify('mini'),
        'process.env.TARO_VERSION': JSON.stringify(taroVersion),
        ENABLE_ADJACENT_HTML: 'false',
        ENABLE_CLONE_NODE: 'false',
        ENABLE_CONTAINS: 'false',
        ENABLE_INNER_HTML: 'false',
        ENABLE_MUTATION_OBSERVER: 'false',
        ENABLE_SIZE_APIS: 'false',
        ENABLE_TEMPLATE_CONTENT: 'false'
    }
}
