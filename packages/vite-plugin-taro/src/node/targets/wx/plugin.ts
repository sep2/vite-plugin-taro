import path from 'node:path'
import type { Plugin, PluginOption } from 'vite'
import type { BuildContext } from '../../build-context.ts'
import { normalizeModuleId, stripVirtualPrefix } from '../../utils/modules.ts'
import { packageRequire } from '../../utils/packages.ts'
import { emitWxCompanionAssets, type WxBundle } from './companion-assets.ts'
import { emitWxEntryChunks, isWxVirtualModuleId, loadWxVirtualModule, virtualWxAppId } from './virtual-modules.ts'

const taroWxComponentsPath = packageRequire.resolve('@tarojs/plugin-platform-weapp/dist/components-react')
const vitePluginTaroSourcePath = normalizeModuleId(path.dirname(packageRequire.resolve('vite-plugin-taro')))
const taroVersion = String(packageRequire('@tarojs/runtime/package.json').version)

/** Creates the plugins that own WX build configuration and output generation. */
export function createWxTargetPlugins(context: BuildContext): PluginOption[] {
    return [createWxTargetPlugin(context)]
}

function createWxTargetPlugin(context: BuildContext): Plugin {
    return {
        name: 'vite-plugin-taro:wx',

        config() {
            return {
                define: createWxTaroDefines(),
                css: {
                    lightningcss: {
                        visitor: {
                            // keep CSS3 style single colon :before, :after
                            // while WeChat Mini Program does not support the double colons versions
                            Selector(selector) {
                                return selector.map((component) => {
                                    if (
                                        component.type === 'pseudo-element' &&
                                        (component.kind === 'before' || component.kind === 'after')
                                    ) {
                                        return {
                                            type: 'pseudo-element' as const,
                                            kind: 'custom' as const,
                                            name: component.kind
                                        }
                                    }
                                    return component
                                })
                            }
                        }
                    }
                },
                resolve: {
                    alias: [{ find: /^@tarojs\/components$/, replacement: taroWxComponentsPath }]
                },
                build: {
                    target: 'es2018',
                    assetsInlineLimit: 1024,
                    cssCodeSplit: false,
                    // weapp-tailwindcss has no minifier setting; retain Vite's production CSS minification.
                    cssMinify: context.development ? false : 'lightningcss',
                    minify: !context.development,
                    rolldownOptions: {
                        input: { app: virtualWxAppId },
                        experimental: {
                            // remove vite virtual module \0 in comments, which causes WeChat DevTools failed to compile
                            attachDebugInfo: 'none'
                        },
                        output: {
                            format: 'cjs',
                            entryFileNames: '[name].js',
                            assetFileNames: 'assets/[name][extname]',
                            chunkFileNames: ({ name }) => `${name === 'rolldown-runtime' ? 'runtime' : name}.js`,
                            strictExecutionOrder: true,
                            codeSplitting: {
                                includeDependenciesRecursively: false,
                                minSize: 0,
                                groups: [
                                    { name: 'taro', test: isWxTaroChunkModule, priority: 100 },
                                    { name: 'vendors', test: isNodeModule, priority: 10 },
                                    { name: 'common', minShareCount: 2, minModuleSize: 1, priority: 1 }
                                ]
                            }
                        }
                    }
                }
            }
        },

        resolveId: {
            order: 'pre',
            handler(id) {
                return isWxVirtualModuleId(id) ? `\0${id}` : undefined
            }
        },

        load: {
            order: 'post',
            handler(id) {
                const cleanId = stripVirtualPrefix(id)

                emitWxEntryChunks(this, context, cleanId)

                return loadWxVirtualModule(cleanId, context)
            }
        },

        generateBundle: {
            order: 'post',
            async handler(_, bundle) {
                await emitWxCompanionAssets(this, bundle as WxBundle, context)
            }
        }
    }
}

function createWxTaroDefines(): Record<string, string> {
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

function isWxTaroChunkModule(id: string): boolean {
    const normalizedId = normalizeModuleId(id)
    return normalizedId.includes('/node_modules/@tarojs/') || normalizedId.startsWith(`${vitePluginTaroSourcePath}/`)
}

function isNodeModule(id: string): boolean {
    return normalizeModuleId(id).includes('/node_modules/')
}
