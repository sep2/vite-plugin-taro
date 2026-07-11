import type { types as BabelTypes, NodePath, PluginObj } from '@babel/core'
import babel from '@rolldown/plugin-babel'
import type { HtmlTagDescriptor, Plugin, PluginOption, UserConfig } from 'vite'
import { h5ShimImportPath, isProd, nodeRequire } from '../constants.ts'
import type { JsonObject, VitePluginTaroBuildContext, VitePluginTaroPageOption } from '../types.ts'
import { createPageComponentImport, stripVirtualPrefix, toImportPath } from '../utils.ts'
import { resolvePublicVirtualModuleId, virtualTaroApiId } from '../virtual-modules.ts'

const virtualH5Id = 'virtual:vite-plugin-taro/h5'

/** Creates the plugins that own the complete H5 target lifecycle. */
export function createH5TargetPlugins(context: VitePluginTaroBuildContext): PluginOption[] {
    return [...createH5SupportPlugins(), createH5TargetPlugin(context)]
}

function createH5TargetPlugin(context: VitePluginTaroBuildContext): Plugin {
    return {
        name: 'vite-plugin-taro:h5',

        config: {
            order: 'pre',
            handler: createH5ViteConfig
        },

        resolveId: {
            order: 'pre',
            handler(id) {
                return resolvePublicVirtualModuleId(id) ?? (isH5VirtualModuleId(id) ? `\0${id}` : undefined)
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
                return createWebIndexHtmlTags(context)
            }
        }
    }
}

/** Checks whether an id belongs to an H5 virtual module. */
function isH5VirtualModuleId(id: string): boolean {
    return id === virtualH5Id
}

/**
 * Loads generated source for H5 virtual modules.
 */
function loadH5VirtualModule(cleanId: string, context: VitePluginTaroBuildContext): string | undefined {
    if (cleanId === virtualH5Id) {
        return createWebEntry(context)
    }
}

/**
 * Configures the Vite pieces needed for Taro H5 resolve/runtime behavior.
 */
function createH5ViteConfig(): UserConfig {
    return {
        define: createH5TaroDefines(),
        resolve: {
            mainFields: ['main:h5', 'browser', 'module', 'jsnext:main', 'jsnext'],
            alias: [
                // Resolve Stencil's transitive runtime import after Taro components are optimized separately.
                {
                    find: /^@stencil\/core\/internal\/client$/,
                    replacement: nodeRequire.resolve('@stencil/core/internal/client', {
                        paths: [nodeRequire.resolve('@tarojs/components/package.json')]
                    })
                },
                // H5 React code must use Taro's React component wrappers, not the raw custom-element entry.
                { find: /^@tarojs\/components$/, replacement: nodeRequire.resolve('@tarojs/components/lib/react') },
                // Taro's H5 router/components deep-import this custom-element loader; make it resolvable under pnpm.
                {
                    find: /^@tarojs\/components\/dist\/components$/,
                    replacement: nodeRequire.resolve('@tarojs/components/dist/components')
                },
                // H5 APIs are exported from the platform API barrel; the generic @tarojs/taro root is native-oriented.
                {
                    find: /^@tarojs\/taro$/,
                    replacement: nodeRequire.resolve('@tarojs/plugin-platform-h5/dist/runtime/apis')
                }
            ]
        },
        optimizeDeps: {
            // Keep the Stencil runtime in Vite's transform pipeline so rewriteStencilStyleInsertion can patch it.
            exclude: ['@stencil/core/internal/client']
        },
        build: {
            target: 'es2018',
            minify: isProd
        }
    }
}

/**
 * Creates H5-only support plugins used before the target emitter runs.
 *
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-platform-h5/src/program.ts#L219-L249
 */
function createH5SupportPlugins(): PluginOption[] {
    return [
        babel({
            include: /[\\/]@stencil[\\/]core[\\/]internal[\\/]client[\\/]index\.js(?:\?.*)?$/,
            exclude: [],
            plugins: [rewriteStencilStyleInsertion]
        }),
        // Mirrors Taro H5: rewrite default Taro.xxx calls from virtual:taro/api to named H5 API imports.
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

/**
 * Keeps Stencil-injected Taro runtime CSS before the app stylesheet.
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

function isStencilStyleInsertBeforeCall(path: NodePath<BabelTypes.CallExpression>): boolean {
    return (
        path.get('callee').matchesPattern('styleContainerNode.insertBefore') &&
        path.get('arguments.0').toString() === 'styleElm' &&
        path.get('arguments.1').toString() === "styleContainerNode.querySelector('link')"
    )
}

/**
 * Creates compile-time constants expected by Taro's Web runtime packages.
 *
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/webpack/H5WebpackPlugin.ts#L51-L69
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

/**
 * Injects vite-plugin-taro's generated Web entry into Vite's HTML shell.
 */
function createWebIndexHtmlTags(context: VitePluginTaroBuildContext): HtmlTagDescriptor[] | undefined {
    if (context.target !== 'h5') return

    const tags: HtmlTagDescriptor[] = []
    tags.push({
        tag: 'script',
        attrs: { type: 'module' },
        children: `import '${virtualH5Id}'`,
        injectTo: 'body'
    })
    return tags
}

/**
 * Builds the generated Web entry around Taro's official Web router/runtime APIs.
 * Static Taro CSS is imported before the app; runtime Stencil CSS keeps coarse ordering before app CSS.
 *
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-loader/src/h5.ts#L120-L150
 */
function createWebEntry(context: VitePluginTaroBuildContext): string {
    const webAppConfigCode = JSON.stringify(createWebAppConfig(context.appConfig))
    const webRoutesConfigCode = createWebRoutesConfig(context.pages)

    return `import {
    createHashHistory,
    createReactApp,
    createRouter,
    handleAppMount,
    window
} from ${JSON.stringify(h5ShimImportPath)}
import React from 'react'
import ReactDOM from 'react-dom/client'
import AppComponent from ${JSON.stringify(toImportPath(context.appComponentFile))}

const config = window.__taroAppConfig = ${webAppConfigCode}
config.routes = ${webRoutesConfigCode}
const app = createReactApp(AppComponent, React, ReactDOM, config)
const history = createHashHistory({ window })
handleAppMount(config, history)
createRouter(history, app, config, React)
`
}

/**
 * Creates the H5 app config consumed by Taro's Web router.
 * Taro's H5 runtime expects `config.router` to exist, even when it is an empty object.
 *
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/plugins/H5Plugin.ts#L49-L53
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/plugins/H5Plugin.ts#L133-L138
 */
function createWebAppConfig(sharedAppConfig: JsonObject): JsonObject {
    return {
        router: {},
        ...sharedAppConfig
    }
}

/**
 * Creates Web route records in the same shape as Taro's H5 loader.
 *
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-loader/src/h5.ts#L12-L21
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-loader/src/h5.ts#L108-L114
 */
function createWebRoutesConfig(webPages: VitePluginTaroPageOption[]): string {
    const webRoutes = webPages.map((page) =>
        [
            'Object.assign({',
            `  path: ${JSON.stringify(page.path)},`,
            '  load: async function(context, params) {',
            `    const page = await import(${JSON.stringify(createPageComponentImport(page.path))})`,
            '    return [page, context, params]',
            '  }',
            `}, ${JSON.stringify(page.config)})`
        ].join('\n')
    )
    return `[\n${webRoutes.join(',\n')}\n]`
}
