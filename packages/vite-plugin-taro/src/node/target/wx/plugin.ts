import type { Plugin } from 'vite'
import { DevEnvironment } from 'vite'
import type { VitePluginTaroOptions } from '../../../options.ts'
import { packageRequire } from '../../utils/packages.ts'
import { createWxVirtualModules } from './virtual-modules.ts'

const wxEnvironmentName = 'wx'
const wxJavaScriptTarget = 'es2018'

export function createWxTargetPlugin(options: VitePluginTaroOptions): Plugin {
    const virtualModules = createWxVirtualModules(options)

    return {
        name: 'vite-plugin-taro:wx',

        config() {
            return {
                // Taro's compile-time flags select its React Mini Program runtime and remove unsupported DOM branches.
                define: createWxTaroDefines(),

                // WX has native App/Page entries and must not use Vite's SPA HTML fallback.
                appType: 'custom',

                // Vite's development source transforms must emit syntax supported by the WX runtime.
                oxc: { target: wxJavaScriptTarget },

                // The default app builder targets the browser client; WX is the only production environment for this target.
                builder: {
                    async buildApp(builder) {
                        await builder.build(builder.environments[wxEnvironmentName])
                    }
                },

                resolve: {
                    alias: [
                        // The public component facade stays target-neutral; WX selects Taro's native host names here.
                        {
                            find: /^@tarojs\/components$/,
                            replacement: packageRequire.resolve('@tarojs/plugin-platform-weapp/dist/components-react')
                        }
                    ]
                },

                environments: {
                    [wxEnvironmentName]: {
                        // WX consumes client-side package exports, CSS, and assets without being a browser environment.
                        consumer: 'client',

                        dev: {
                            // WX modules execute in DevTools, so Vite must transform them without a Node ModuleRunner.
                            createEnvironment(name, config) {
                                return new DevEnvironment(name, config, {
                                    // HMR stays disabled until the WX metadata channel has an update consumer.
                                    hot: false
                                })
                            }
                        },

                        build: {
                            // WX has no browser module-preload runtime.
                            modulePreload: false,

                            // Production chunks must use the same WX-supported syntax level as development modules.
                            target: wxJavaScriptTarget,

                            rolldownOptions: {
                                // Build the generated App and Page delegates instead of an HTML entry.
                                input: virtualModules.input,

                                // Native facades consume delegate exports outside the ESM graph.
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
            return virtualModules.load(id, this.environment.config.root)
        }
    }
}

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
