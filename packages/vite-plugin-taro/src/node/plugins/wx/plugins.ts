import type { Plugin } from 'vite'
import { DevEnvironment } from 'vite'
import type { VitePluginTaroOptions } from '../../../options.ts'
import { toViteFileImportPath } from '../../utils/modules.ts'
import { packageRequire, resolvePackageFile } from '../../utils/packages.ts'
import { appShellFileName } from './app/constant.ts'
import { generateBundle } from './generate-bundle.ts'
import { postRenderChunk } from './post-render-chunk.ts'
import { isVitePreload, overrideVitePreload } from './vite-preload/vite-preload.ts'

const wxEnvironmentName = 'wx'
const wxJavaScriptTarget = 'es2018'
const appShellImportPath = toViteFileImportPath(resolvePackageFile('dist/runtime/wx/app.js'))

/** Creates the WX target plugins. */
export function createWxTargetPlugins(options: VitePluginTaroOptions): Plugin[] {
    return [createWxTargetPlugin(options)]
}

/** Configures the WX Vite environment. */
function createWxTargetPlugin(options: VitePluginTaroOptions): Plugin {
    return {
        name: 'vite-plugin-taro:wx',

        config() {
            return {
                define: createWxDefines(options),

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
                                input: {
                                    [appShellFileName]: appShellImportPath
                                },
                                output: {
                                    entryFileNames: appShellFileName
                                },
                                preserveEntrySignatures: 'strict'
                            }
                        }
                    }
                }
            }
        },

        load(id) {
            if (isVitePreload(id)) {
                return overrideVitePreload(id)
            }
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

/** Creates WX compile-time constants. */
function createWxDefines(options: VitePluginTaroOptions): Record<string, string> {
    const taroVersion = String((packageRequire('@tarojs/runtime/package.json') as { version: string }).version)

    return {
        __VITE_PLUGIN_TARO_APP_CONFIG__: JSON.stringify(options.appJson),
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
