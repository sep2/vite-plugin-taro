import type { Plugin, PluginOption } from 'vite'
import type { VitePluginTaroOptions } from '../../../options.ts'
import { esTarget } from '../../utils/constant.ts'
import { packageRequire } from '../../utils/packages.ts'
import { generateBundle } from './bundle/generate-bundle.ts'
import { renderCapsule } from './capsule/render-capsule.ts'
import { getWxModuleKind, isTransportModule } from './native/module-kind.ts'
import { renderNative } from './native/render-native.ts'
import { createPlacer } from './placer/placer.ts'
import { createModuleResolver } from './resolver/module-resolver.ts'
import { materializeTransport } from './transport/materialize-transport.ts'

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
                define: createWxDefines(),

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
                        input: moduleResolver.input
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
                return moduleResolver.transform(code, id)
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
                const files = generateBundle({ bundle, options, subpackages })

                files.forEach((file) => {
                    this.emitFile(file)
                })
            }
        }
    }
}

/** Taro legacy constants */
function createWxDefines(): Record<string, string> {
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
