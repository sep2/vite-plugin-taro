import type { types as BabelTypes, NodePath, PluginObject } from '@babel/core'
import babel from '@rolldown/plugin-babel'
import type { Plugin, PluginOption } from 'vite'
import type { VitePluginTaroOptions } from '../../../options.ts'
import { packageRequire } from '../../utils/packages.ts'
import { clientTaroApiId } from '../client/client-taro.ts'
import { createH5EntrySource, createH5IndexHtmlTags, h5EntryId } from './virtual-module.ts'

/** Creates the plugins that own the H5 target. */
export function createH5TargetPlugins(options: VitePluginTaroOptions): PluginOption[] {
    return [...createH5SupportPlugins(), createH5TargetPlugin(options)]
}

/** Configures H5 resolution and supplies the generated application entry. */
function createH5TargetPlugin(options: VitePluginTaroOptions): Plugin {
    return {
        name: 'vite-plugin-taro:h5',

        config() {
            return {
                define: createH5Defines(),
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
                    target: 'es2018'
                }
            }
        },

        resolveId: {
            order: 'pre',
            handler(id) {
                if (id === h5EntryId) {
                    return `\0${id}`
                }
            }
        },

        load: {
            order: 'post',
            handler(id) {
                if (id === `\0${h5EntryId}`) {
                    return createH5EntrySource(options, this.environment.config.root)
                }
            }
        },

        transformIndexHtml: {
            order: 'pre',
            handler() {
                return createH5IndexHtmlTags()
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
                        packageName: clientTaroApiId,
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
function rewriteStencilStyleInsertion(): PluginObject {
    return {
        name: 'vite-plugin-taro:rewrite-stencil-style-insertion',
        visitor: {
            CallExpression(callPath: NodePath<BabelTypes.CallExpression>) {
                if (!isStencilStyleInsertBeforeCall(callPath)) {
                    return
                }
                callPath
                    .get('arguments.1')
                    .replaceWithSourceString(
                        `scopeId.startsWith('sc-taro-') ? styleContainerNode.querySelector('style,link[rel="stylesheet"]') : styleContainerNode.querySelector('link')`
                    )
            }
        }
    }
}

/** Identifies Stencil's default component-style insertion call. */
function isStencilStyleInsertBeforeCall(callPath: NodePath<BabelTypes.CallExpression>): boolean {
    return (
        callPath.get('callee').matchesPattern('styleContainerNode.insertBefore') &&
        callPath.get('arguments.0').toString() === 'styleElm' &&
        callPath.get('arguments.1').toString() === "styleContainerNode.querySelector('link')"
    )
}

/** Creates H5 Taro compile-time constants. */
function createH5Defines(): Record<string, string> {
    return {
        'process.env.FRAMEWORK': JSON.stringify('react'),
        'process.env.SUPPORT_TARO_POLYFILL': JSON.stringify('disabled'),
        'process.env.TARO_ENV': JSON.stringify('h5'),
        'process.env.TARO_PLATFORM': JSON.stringify('web'),
        'process.env.SUPPORT_DINGTALK_NAVIGATE': JSON.stringify('disabled'),
        DEPRECATED_ADAPTER_COMPONENT: 'false'
    }
}
