import type { types as BabelTypes } from '@babel/core'
import { type NodePath, type PluginObject, types } from '@babel/core'
import babel from '@rolldown/plugin-babel'
import type { HtmlTagDescriptor, Plugin, PluginOption } from 'vite'
import type { VitePluginTaroOptions } from '../../../options.ts'
import { toViteFileImportPath } from '../../utils/modules.ts'
import { packageRequire } from '../../utils/packages.ts'
import { clientTaroApiId } from '../client/client-taro.ts'
import { h5AppPath } from './constant.ts'
import { createModuleResolver } from './resolver/module-resolver.ts'

/** Creates the plugins that own the H5 target. */
export function createH5TargetPlugins(options: VitePluginTaroOptions): PluginOption[] {
    return [...createH5SupportPlugins(), createH5TargetPlugin(options)]
}

/** Configures H5 resolution and supplies the specialized physical application entry. */
function createH5TargetPlugin(options: VitePluginTaroOptions): Plugin {
    const moduleResolver = createModuleResolver(options)

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
                return moduleResolver.resolveId({
                    id,
                    projectRoot: this.environment.config.root
                })
            }
        },

        transform: {
            order: 'pre',
            handler(code, id) {
                return moduleResolver.transform({
                    code,
                    id,
                    projectRoot: this.environment.config.root
                })
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

/** Injects the physical H5 App into the application document. */
function createH5IndexHtmlTags(): HtmlTagDescriptor[] {
    return [
        {
            tag: 'script',
            attrs: {
                type: 'module'
            },
            children: `import '${toViteFileImportPath(h5AppPath)}'`,
            injectTo: 'body'
        }
    ]
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
            CallExpression(callPath) {
                if (!isStencilStyleInsertBeforeCall(callPath)) {
                    return
                }

                callPath
                    .get('arguments.1')
                    .replaceWith(
                        types.conditionalExpression(
                            types.callExpression(
                                types.memberExpression(types.identifier('scopeId'), types.identifier('startsWith')),
                                [types.stringLiteral('sc-taro-')]
                            ),
                            createStyleQuery('style,link[rel="stylesheet"]'),
                            createStyleQuery('link')
                        )
                    )
            }
        }
    }
}

/** Identifies Stencil's default component-style insertion call. */
function isStencilStyleInsertBeforeCall(callPath: NodePath<BabelTypes.CallExpression>): boolean {
    const { callee, arguments: callArguments } = callPath.node
    return (
        types.isMemberExpression(callee) &&
        types.isIdentifier(callee.object, { name: 'styleContainerNode' }) &&
        types.isIdentifier(callee.property, { name: 'insertBefore' }) &&
        types.isIdentifier(callArguments[0], { name: 'styleElm' }) &&
        isStyleQuery(callArguments[1], 'link')
    )
}

/** Identifies one style-container querySelector call. */
function isStyleQuery(node: BabelTypes.Node | null | undefined, selector: string): boolean {
    return (
        types.isCallExpression(node) &&
        types.isMemberExpression(node.callee) &&
        types.isIdentifier(node.callee.object, { name: 'styleContainerNode' }) &&
        types.isIdentifier(node.callee.property, { name: 'querySelector' }) &&
        types.isStringLiteral(node.arguments[0], { value: selector })
    )
}

/** Creates one style-container querySelector call. */
function createStyleQuery(selector: string): ReturnType<typeof types.callExpression> {
    return types.callExpression(
        types.memberExpression(types.identifier('styleContainerNode'), types.identifier('querySelector')),
        [types.stringLiteral(selector)]
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
