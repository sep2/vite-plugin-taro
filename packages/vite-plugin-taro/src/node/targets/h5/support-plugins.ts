import type { types as BabelTypes, NodePath, PluginObj } from '@babel/core'
import babel from '@rolldown/plugin-babel'
import type { PluginOption } from 'vite'
import { virtualTaroApiId } from '../../plugins/taro-runtime.ts'
import { packageRequire } from '../../utils/packages.ts'

/** Creates H5-only Babel transforms for Stencil CSS ordering and Taro API imports. */
export function createH5SupportPlugins(): PluginOption[] {
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
