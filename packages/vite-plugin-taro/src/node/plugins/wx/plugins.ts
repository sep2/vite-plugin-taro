import type { Plugin, PluginOption } from 'vite'
import type { VitePluginTaroOptions } from '../../../options.ts'
import { esTarget } from '../../utils/constant.ts'
import { packageRequire } from '../../utils/packages.ts'
import { createWxDevelopmentPlugin } from './dev/dev.ts'
import { getWxModuleKind, isTransportModule } from './module.ts'
import { createOutputFiles } from './output/files.ts'
import { createPlacer } from './placement/placer.ts'
import { renderCapsule } from './render/capsule.ts'
import { renderNative } from './render/native.ts'
import { materializeTransport } from './render/transport.ts'
import { createResolver } from './resolve/resolver.ts'

/** Creates the complete plugin set for the wx target. */
export function createWxTargetPlugins(options: VitePluginTaroOptions): PluginOption[] {
    return [createWxPlugin(options), createWxDevelopmentPlugin(options)]
}

/** Configures the complete wx target build pipeline. */
function createWxPlugin(options: VitePluginTaroOptions): Plugin {
    const resolver = createResolver(options)
    const placer = createPlacer()

    return {
        name: 'vite-plugin-taro:wx',

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
                    cssCodeSplit: false,
                    // Let weapp-tailwindcss own final WXSS transformation.
                    cssMinify: false,

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
            handler(code, id) {
                return resolver.specialize(code, id)
            }
        },

        renderStart() {
            placer.analyze({
                moduleIds: this.getModuleIds(),
                getModuleInfo: (moduleId) => this.getModuleInfo(moduleId)
            })
        },

        renderChunk: {
            order: 'post',
            async handler(code, chunk, _outputOptions, meta) {
                const moduleKind = getWxModuleKind(chunk)

                if (moduleKind === 'capsule') {
                    return renderCapsule(code, chunk)
                }

                // Native and amphibious modules share the CommonJS renderer. Amphibious transport exposure is a
                // separate concern materialized from final output paths after the physical transport itself is rendered.
                const native = renderNative(code, chunk)

                if (isTransportModule(chunk)) {
                    return materializeTransport({
                        code: native.code,
                        transportChunk: chunk,
                        chunks: meta.chunks,
                        getLoadMode: placer.getLoadMode
                    })
                }

                return native
            }
        },

        generateBundle: {
            order: 'post',
            handler(_, bundle) {
                const subpackages = placer.getSubpackages(bundle)
                const outputFiles = createOutputFiles({ bundle, options, subpackages })

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
        ENABLE_ADJACENT_HTML: 'false',
        ENABLE_CLONE_NODE: 'false',
        ENABLE_CONTAINS: 'false',
        ENABLE_INNER_HTML: 'false',
        ENABLE_MUTATION_OBSERVER: 'false',
        ENABLE_SIZE_APIS: 'false',
        ENABLE_TEMPLATE_CONTENT: 'false'
    }
}
