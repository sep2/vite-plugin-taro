import type { types as BabelTypes, NodePath, PluginObj } from '@babel/core'
import babel from '@rolldown/plugin-babel'
import type { Plugin, PluginOption } from 'vite'
import type { BuildContext } from '../../build-context.ts'
import { virtualTaroApiId } from '../../plugins/taro-runtime.ts'
import { stripVirtualPrefix } from '../../utils/modules.ts'
import { packageRequire } from '../../utils/packages.ts'
import { createH5IndexHtmlTags, isH5VirtualModuleId, loadH5VirtualModule } from './virtual-modules.ts'

/** Creates the plugins that own the complete H5 target lifecycle. */
export function createH5TargetPlugins(context: BuildContext): PluginOption[] {
    return [...createH5SupportPlugins(), createH5TargetPlugin(context)]
}

function createH5TargetPlugin(context: BuildContext): Plugin {
    return {
        name: 'vite-plugin-taro:h5',

        config() {
            return {
                define: createH5TaroDefines(),
                resolve: {
                    mainFields: ['main:h5', 'browser', 'module', 'jsnext:main', 'jsnext'],
                    alias: [
                        {
                            find: /^@stencil\/core\/internal\/client$/,
                            replacement: packageRequire.resolve('@stencil/core/internal/client', {
                                paths: [packageRequire.resolve('@tarojs/components/package.json')]
                            })
                        },
                        {
                            find: /^@tarojs\/components$/,
                            replacement: packageRequire.resolve('@tarojs/components/lib/react')
                        },
                        {
                            find: /^@tarojs\/components\/dist\/components$/,
                            replacement: packageRequire.resolve('@tarojs/components/dist/components')
                        },
                        {
                            find: /^@tarojs\/taro$/,
                            replacement: packageRequire.resolve('@tarojs/plugin-platform-h5/dist/runtime/apis')
                        }
                    ]
                },
                optimizeDeps: {
                    exclude: ['@stencil/core/internal/client']
                },
                build: {
                    target: 'es2018',
                    minify: !context.development
                }
            }
        },

        resolveId: {
            order: 'pre',
            handler(id) {
                return isH5VirtualModuleId(id) ? `\0${id}` : undefined
            }
        },

        load: {
            order: 'post',
            handler(id) {
                return loadH5VirtualModule(stripVirtualPrefix(id), context)
            }
        },

        transformIndexHtml: {
            order: 'pre',
            handler() {
                return createH5IndexHtmlTags(context)
            }
        }
    }
}

/** Creates H5-only Babel transforms for Stencil CSS ordering and Taro API imports. */
function createH5SupportPlugins(): PluginOption[] {
    return [
        babel({
            include: /[\\/]@stencil[\\/]core[\\/]internal[\\/]client[\\/]index\.js(?:\?.*)?$/,
            exclude: [],
            plugins: [rewriteStencilStyleInsertion]
        }),
        babel({
            plugins: [
                [
                    packageRequire.resolve('babel-plugin-transform-taroapi'),
                    {
                        packageName: virtualTaroApiId,
                        definition: packageRequire(
                            packageRequire.resolve('@tarojs/plugin-platform-h5/dist/definition.json')
                        )
                    }
                ]
            ]
        })
    ]
}

/** Keeps Stencil-injected Taro component styles before application stylesheets. */
function rewriteStencilStyleInsertion(): PluginObj {
    return {
        name: 'rewrite-stencil-style-insertion',
        visitor: {
            CallExpression(path: NodePath<BabelTypes.CallExpression>) {
                if (!isStencilStyleInsertBeforeCall(path)) return
                path.get('arguments.1').replaceWithSourceString(
                    `scopeId.startsWith('sc-taro-') ? styleContainerNode.querySelector('style,link[rel="stylesheet"]') : styleContainerNode.querySelector('link')`
                )
            }
        }
    }
}

function isStencilStyleInsertBeforeCall(path: NodePath<BabelTypes.CallExpression>): boolean {
    return (
        path.get('callee').matchesPattern('styleContainerNode.insertBefore') &&
        path.get('arguments.0').toString() === 'styleElm' &&
        path.get('arguments.1').toString() === "styleContainerNode.querySelector('link')"
    )
}

function createH5TaroDefines(): Record<string, string> {
    return {
        'process.env.FRAMEWORK': JSON.stringify('react'),
        'process.env.SUPPORT_TARO_POLYFILL': JSON.stringify('disabled'),
        'process.env.TARO_ENV': JSON.stringify('h5'),
        'process.env.TARO_PLATFORM': JSON.stringify('web'),
        'process.env.SUPPORT_DINGTALK_NAVIGATE': JSON.stringify('disabled'),
        DEPRECATED_ADAPTER_COMPONENT: 'false'
    }
}
