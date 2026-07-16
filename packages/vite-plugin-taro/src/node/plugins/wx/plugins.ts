import type { Plugin } from 'vite'
import { DevEnvironment } from 'vite'
import type { VitePluginTaroOptions } from '../../../options.ts'
import { packageRequire } from '../../utils/packages.ts'
import { generateBundle } from './render/generate-bundle.ts'
import { postRenderChunk } from './render/post-render-chunk.ts'
import { createWxVirtualModules } from './virtual/virtual-modules.ts'

const wxEnvironmentName = 'wx'
const wxJavaScriptTarget = 'es2018'

/** Creates the WX target plugins. */
export function createWxTargetPlugins(options: VitePluginTaroOptions): Plugin[] {
    return [createWxTargetPlugin(options)]
}

/** Configures the WX Vite environment. */
function createWxTargetPlugin(options: VitePluginTaroOptions): Plugin {
    const virtualModules = createWxVirtualModules(options)

    return {
        name: 'vite-plugin-taro:wx',

        config() {
            return {
                define: createWxTaroDefines(),

                appType: 'custom',

                oxc: { target: wxJavaScriptTarget },

                builder: {
                    async buildApp(builder) {
                        await builder.build(builder.environments[wxEnvironmentName])
                    }
                },

                resolve: {
                    alias: [
                        {
                            find: /^@tarojs\/components$/,
                            replacement: packageRequire.resolve('@tarojs/plugin-platform-weapp/dist/components-react')
                        }
                    ]
                },

                environments: {
                    [wxEnvironmentName]: {
                        consumer: 'client',

                        dev: {
                            createEnvironment(name, config) {
                                return new DevEnvironment(name, config, {
                                    hot: false
                                })
                            }
                        },

                        build: {
                            modulePreload: false,

                            target: wxJavaScriptTarget,

                            rolldownOptions: {
                                input: virtualModules.input,
                                preserveEntrySignatures: 'strict'
                            }
                        }
                    }
                }
            }
        },

        resolveId(id) {
            return virtualModules.resolveId(id)
        },

        load(id) {
            const projectRoot = this.environment.config.root
            return virtualModules.load(id, projectRoot)
        },

        renderChunk: {
            order: 'post',
            handler: postRenderChunk
        },

        generateBundle(_, bundle) {
            generateBundle(bundle).forEach((file) => {
                this.emitFile(file)
            })
        }
    }
}

/** Creates Taro's WX compile-time constants. */
function createWxTaroDefines(): Record<string, string> {
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
