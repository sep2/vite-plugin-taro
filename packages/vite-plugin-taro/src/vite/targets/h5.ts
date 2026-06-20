import babel from '@rolldown/plugin-babel'
import react from '@vitejs/plugin-react'
import type { HtmlTagDescriptor, PluginOption, UserConfig } from 'vite'
import { isProd, nodeRequire } from '../constants.ts'
import type { JsonObject, TaroBuildContext, TaroPageOption } from '../types.ts'
import { createPageComponentImport } from '../utils.ts'

const virtualH5Id = 'virtual:vite-plugin-taro/h5'
const pluginTaroImport = 'vite-plugin-taro/taro'

/**
 * Checks whether an id belongs to an H5 virtual module.
 */
export function isH5VirtualModuleId(id: string): boolean {
    return id === virtualH5Id
}

/**
 * Loads generated source for H5 virtual modules.
 */
export function loadH5VirtualModule(cleanId: string, context: TaroBuildContext): string | undefined {
    if (cleanId !== virtualH5Id) return
    return createWebEntry(context)
}

/**
 * Configures the Vite pieces needed for Taro H5 resolve/runtime behavior.
 */
export function createH5ViteConfig(): UserConfig {
    return {
        define: createH5TaroDefines(),
        resolve: {
            mainFields: ['main:h5', 'browser', 'module', 'jsnext:main', 'jsnext'],
            alias: [
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
export function createH5SupportPlugins(): PluginOption[] {
    return [
        ...react(),
        // Mirrors Taro H5: rewrite default Taro.xxx calls from vite-plugin-taro/taro to named H5 API imports.
        babel({
            plugins: [
                [
                    nodeRequire.resolve('babel-plugin-transform-taroapi'),
                    {
                        packageName: pluginTaroImport,
                        definition: nodeRequire(nodeRequire.resolve('@tarojs/plugin-platform-h5/dist/definition.json'))
                    }
                ]
            ]
        })
    ]
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
        IS_H5: 'true',
        IS_WEAPP: 'false',
        'process.env.SUPPORT_DINGTALK_NAVIGATE': JSON.stringify('disabled'),
        DEPRECATED_ADAPTER_COMPONENT: 'false'
    }
}

/**
 * Injects vite-plugin-taro's generated Web entry into Vite's HTML shell.
 */
export function createWebIndexHtmlTags(context: TaroBuildContext): HtmlTagDescriptor[] | undefined {
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
 * vite-plugin-taro omits Taro's generated pxTransform initialization; apps should handle style transforms in their own Vite pipeline.
 *
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-loader/src/h5.ts#L120-L150
 */
export function createWebEntry(context: TaroBuildContext): string {
    const webAppConfigCode = JSON.stringify(createWebAppConfig(context.appConfig))
    const webRoutesConfigCode = createWebRoutesConfig(context.pages)

    return `import {
    createHashHistory,
    createReactApp,
    createRouter,
    handleAppMount,
    window
} from 'vite-plugin-taro/shim/h5'
import React from 'react'
import ReactDOM from 'react-dom/client'
import AppComponent from '${context.appComponentImport}'

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
function createWebRoutesConfig(webPages: TaroPageOption[]): string {
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
