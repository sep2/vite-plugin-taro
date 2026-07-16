import type { types as BabelTypes, NodePath, PluginObj } from '@babel/core'
import babel from '@rolldown/plugin-babel'
import type { Plugin, PluginOption } from 'vite'
import type { BuildContext } from '../../build-context.ts'
import { createH5CssPlugins } from '../../css/css-pipeline.ts'
import { virtualTaroApiId } from '../../plugins/taro-runtime.ts'
import { stripVirtualPrefix } from '../../utils/modules.ts'
import { packageRequire } from '../../utils/packages.ts'
import { createH5IndexHtmlTags, isH5VirtualModuleId, loadH5VirtualModule } from './virtual-modules.ts'

/**
 * Restores the complete current H5 pipeline alongside the greenfield WX environment.
 * Babel compatibility, web-target Tailwind processing, and H5 entry generation remain isolated from WX hooks.
 */
export function createH5TargetPlugins(context: BuildContext): PluginOption[] {
    return [...createH5SupportPlugins(), ...createH5CssPlugins(), createH5TargetPlugin(context)]
}

/**
 * Owns H5 resolution, browser defines, virtual entries, and HTML injection.
 * Keeping these hooks in one target plugin prevents browser aliases from entering the dedicated WX environment.
 */
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

/**
 * Creates H5-only Babel transforms needed by current Taro and Stencil packages.
 * The transforms run before the H5 target plugin so generated imports resolve through the public virtual Taro API.
 */
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

/**
 * Keeps Stencil-injected Taro component styles before application stylesheets.
 * The Babel visitor rewrites only Stencil's known insertion call and leaves every other DOM operation unchanged.
 */
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

/**
 * Narrows the Babel visitor to the exact Stencil style insertion expression.
 * Matching callee and both arguments avoids rewriting unrelated `insertBefore` calls in dependency code.
 */
function isStencilStyleInsertBeforeCall(path: NodePath<BabelTypes.CallExpression>): boolean {
    return (
        path.get('callee').matchesPattern('styleContainerNode.insertBefore') &&
        path.get('arguments.0').toString() === 'styleElm' &&
        path.get('arguments.1').toString() === "styleContainerNode.querySelector('link')"
    )
}

/**
 * Supplies the compile-time environment constants expected by Taro's H5 runtime.
 * Stringified values let Vite fold platform branches without leaking WX runtime settings into the browser bundle.
 */
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
