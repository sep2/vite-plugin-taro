import type { types as BabelTypes, NodePath, PluginObj } from '@babel/core'
import babel from '@rolldown/plugin-babel'
import type { PluginOption, UserConfig } from 'vite'
import type { BuildContext } from '../../context.ts'
import { nodeRequire } from '../../runtime-paths.ts'
import { virtualTaroApiId } from '../../virtual-module-resolver.ts'

export function createH5ViteConfig(context: BuildContext): UserConfig {
    return {
        define: createH5TaroDefines(),
        resolve: {
            mainFields: ['main:h5', 'browser', 'module', 'jsnext:main', 'jsnext'],
            alias: [
                {
                    find: /^@stencil\/core\/internal\/client$/,
                    replacement: nodeRequire.resolve('@stencil/core/internal/client', {
                        paths: [nodeRequire.resolve('@tarojs/components/package.json')]
                    })
                },
                { find: /^@tarojs\/components$/, replacement: nodeRequire.resolve('@tarojs/components/lib/react') },
                {
                    find: /^@tarojs\/components\/dist\/components$/,
                    replacement: nodeRequire.resolve('@tarojs/components/dist/components')
                },
                {
                    find: /^@tarojs\/taro$/,
                    replacement: nodeRequire.resolve('@tarojs/plugin-platform-h5/dist/runtime/apis')
                }
            ]
        },
        optimizeDeps: {
            exclude: ['@stencil/core/internal/client']
        },
        build: {
            target: 'es2018',
            minify: context.behavior.minify
        }
    }
}

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
                    nodeRequire.resolve('babel-plugin-transform-taroapi'),
                    {
                        packageName: virtualTaroApiId,
                        definition: nodeRequire(nodeRequire.resolve('@tarojs/plugin-platform-h5/dist/definition.json'))
                    }
                ]
            ]
        })
    ]
}

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
