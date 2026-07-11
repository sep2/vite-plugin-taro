import path from 'node:path'
import { transformSync } from '@babel/core'
import { recursiveMerge } from '@tarojs/helper'
import { Weapp as WechatPlatform } from '@tarojs/plugin-platform-weapp'
import type { Plugin, PluginOption, ResolvedConfig, UserConfig } from 'vite'
import { WxDevelopmentSession } from '../../wx-dev/session.ts'
import { isProd, nodeRequire, wxDevRuntimeImportPath, wxShimImportPath } from '../constants.ts'
import type { JsonObject, VitePluginTaroBuildContext, VitePluginTaroPageOption } from '../types.ts'
import { createPageComponentImport, normalizeModuleId, stripVirtualPrefix, toImportPath } from '../utils.ts'
import { resolvePublicVirtualModuleId } from '../virtual-modules.ts'

const virtualWxAppId = 'virtual:vite-plugin-taro/wx/app'
const virtualWxCompId = 'virtual:vite-plugin-taro/wx/comp'
const virtualWxPagePrefix = 'virtual:vite-plugin-taro/wx/page/'
const virtualWxRefreshPreambleId = 'virtual:vite-plugin-taro/wx/refresh-preamble'

/** Creates the plugins that own the complete WX build and development lifecycle. */
export function createWxTargetPlugins(context: VitePluginTaroBuildContext): PluginOption[] {
    return [createWxTargetPlugin(context)]
}

function createWxTargetPlugin(context: VitePluginTaroBuildContext): Plugin {
    let development = false
    let resolvedConfig: ResolvedConfig | undefined
    let session: WxDevelopmentSession | undefined

    return {
        name: 'vite-plugin-taro:wx',

        config: {
            order: 'pre',
            handler(_, environment) {
                development = environment.command === 'serve'
                const config = createWxViteConfig(context)
                if (development) config.experimental = { bundledDev: true }
                return config
            }
        },

        configResolved(config) {
            resolvedConfig = config
        },

        resolveId: {
            order: 'pre',
            handler(id) {
                return resolvePublicVirtualModuleId(id) ?? (isWxVirtualModuleId(id) ? `\0${id}` : undefined)
            }
        },

        load: {
            order: 'post',
            handler(id) {
                const cleanId = stripVirtualPrefix(id)
                emitWechatImplicitChunksForVirtualApp(this, context, cleanId)
                if (cleanId === virtualWxRefreshPreambleId) return createWxRefreshPreamble()
                return loadWxVirtualModule(cleanId, context, development)
            }
        },

        transform: {
            order: 'post',
            handler(code, id) {
                if (!development) return
                const appFile = normalizeModuleId(context.appComponentFile)
                const instrumented = normalizeModuleId(id) === appFile ? instrumentWxAppComponent(code, appFile) : code
                const transformed = transformWxRefreshGlobals(instrumented)
                return transformed === code ? undefined : transformed
            }
        },

        generateBundle: {
            order: 'post',
            handler(_, bundle) {
                emitWechatAssets(this, bundle as WechatBundle, context)
                if (development) {
                    this.emitFile({ type: 'asset', fileName: '__wx_hmr__/update.js', source: 'void 0;\n' })
                }
            }
        },

        configureServer: {
            order: 'post',
            handler(server) {
                if (!resolvedConfig)
                    throw new Error('vite-plugin-taro expected Vite configuration before WX server setup.')
                session = new WxDevelopmentSession(resolvedConfig, server)
                session.install()
            }
        },

        closeBundle() {
            return session?.close()
        }
    }
}

/**
 * Checks whether an id belongs to a wx virtual module.
 */
export function isWxVirtualModuleId(id: string): boolean {
    return (
        id === virtualWxAppId ||
        id === virtualWxCompId ||
        id === virtualWxRefreshPreambleId ||
        id.startsWith(virtualWxPagePrefix)
    )
}

export function loadWxVirtualModule(
    cleanId: string,
    context: VitePluginTaroBuildContext,
    development = false
): string | undefined {
    if (cleanId === virtualWxAppId) {
        return createWxAppEntry(context, development)
    }

    if (cleanId === virtualWxCompId) {
        return createWxCompEntry()
    }

    if (!cleanId.startsWith(virtualWxPagePrefix)) {
        return
    }

    const pagePath = cleanId.slice(virtualWxPagePrefix.length)
    const page = context.pages.find((candidate) => candidate.path === pagePath)
    if (page) {
        return createWxPageEntry(page, development)
    }
}

const reactRefreshBabelPath = nodeRequire.resolve('react-refresh/babel')
const taroWechatComponentsReactPath = nodeRequire.resolve('@tarojs/plugin-platform-weapp/dist/components-react')
const vitePluginTaroSourcePath = normalizeModuleId(path.dirname(nodeRequire.resolve('vite-plugin-taro')))
const taroVersion = String(nodeRequire('@tarojs/runtime/package.json').version)

/**
 * Configures wx target entry, output, and chunk layout.
 */
export function createWxViteConfig(_context: VitePluginTaroBuildContext): UserConfig {
    return {
        define: createWechatTaroDefines(),
        css: {
            lightningcss: {
                // Vite 8's CSS minifier uses Lightning CSS. Keep pseudo-elements in CSS3 form so Skyline does not warn.
                visitor: {
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
        // https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/webpack/MiniCombination.ts#L22-L84
        resolve: {
            // https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/webpack/MiniBaseConfig.ts#L44-L73
            alias: [{ find: /^@tarojs\/components$/, replacement: taroWechatComponentsReactPath }]
        },
        build: {
            target: 'es2018',
            assetsInlineLimit: 1024,
            cssCodeSplit: false,
            cssMinify: isProd ? 'lightningcss' : false,
            minify: isProd,
            rolldownOptions: {
                // Start from app; page/component chunks below mirror Taro Webpack's generated entries.
                input: { app: virtualWxAppId },
                experimental: {
                    // Rolldown's dev debug comments include virtual IDs like "\0virtual:...".
                    // WeChat DevTools can blank-screen on those NUL markers, so disable them at the source.
                    attachDebugInfo: 'none'
                },
                output: {
                    format: 'cjs',
                    entryFileNames: '[name].js',
                    assetFileNames: 'assets/[name][extname]',
                    chunkFileNames: createWechatChunkFileName,
                    strictExecutionOrder: true,
                    codeSplitting: {
                        includeDependenciesRecursively: false,
                        minSize: 0,
                        // https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/webpack/MiniCombination.ts#L96-L144
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
}

/**
 * Creates compile-time constants expected by Taro's WeChat runtime packages.
 *
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/webpack/MiniWebpackPlugin.ts#L67-L94
 */
function createWechatTaroDefines(): Record<string, string> {
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

/**
 * Checks whether a module should live in the Taro/framework base chunk.
 * vite-plugin-taro support modules are kept with Taro so pages do not duplicate runtime facades.
 *
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/webpack/MiniCombination.ts#L141-L144
 */
function isWxTaroChunkModule(id: string): boolean {
    const normalizedId = normalizeModuleId(id)
    return normalizedId.includes('/node_modules/@tarojs/') || normalizedId.startsWith(`${vitePluginTaroSourcePath}/`)
}

/**
 * Names Rolldown's helper chunk like Taro webpack's runtime chunk.
 *
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/webpack/MiniCombination.ts#L96-L103
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/webpack/MiniCombination.ts#L115-L117
 */
function createWechatChunkFileName(chunkInfo: { name: string }): string {
    return `${chunkInfo.name === 'rolldown-runtime' ? 'runtime' : chunkInfo.name}.js`
}

/**
 * Checks whether a module is a third-party dependency chunk candidate.
 *
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/webpack/MiniCombination.ts#L132-L139
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-helper/src/utils.ts#L32-L36
 */
function isNodeModule(id: string): boolean {
    return normalizeModuleId(id).includes('/node_modules/')
}

type WechatAssetSource = string | Uint8Array

type WechatBundleModule = {
    renderedExports?: string[]
}

type WechatBundleItem = {
    type: 'asset' | 'chunk'
    source?: WechatAssetSource
    modules?: Record<string, WechatBundleModule>
}

type WechatBundle = Record<string, WechatBundleItem>

type WechatTemplateComponentConfig = {
    includes: Set<string>
    exclude: Set<string>
    thirdPartyComponents: Map<string, Set<string>>
    includeAll: boolean
}

type WechatChunkEmitter = {
    emitFile(chunk: { type: 'chunk'; id: string; fileName: string; implicitlyLoadedAfterOneOf: string[] }): string
}

type WechatAssetEmitter = {
    emitFile(asset: { type: 'asset'; fileName: string; source: WechatAssetSource }): string
}

/**
 * Emits page and component chunks like Taro Webpack's MiniPlugin generated entries.
 *
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/plugins/MiniPlugin.ts#L228-L243
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/plugins/MiniPlugin.ts#L743-L777
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/plugins/TaroSingleEntryPlugin.ts#L18-L38
 */
export function emitWechatImplicitChunksForVirtualApp(
    emitter: WechatChunkEmitter,
    context: VitePluginTaroBuildContext,
    cleanId: string
): void {
    if (context.target !== 'wx' || cleanId !== virtualWxAppId) return

    for (const page of context.pages) {
        emitter.emitFile({
            type: 'chunk',
            id: `${virtualWxPagePrefix}${page.path}`,
            fileName: `${page.path}.js`,
            implicitlyLoadedAfterOneOf: [cleanId]
        })
    }
    emitter.emitFile({
        type: 'chunk',
        id: virtualWxCompId,
        fileName: 'comp.js',
        implicitlyLoadedAfterOneOf: [cleanId]
    })
}

/**
 * Builds the generated WeChat app entry that registers Taro's React App config.
 * vite-plugin-taro omits Taro's generated pxTransform initialization because styles are handled by the Vite CSS pipeline.
 *
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-loader/src/app.ts#L54-L63
 */
export function createWxAppEntry(context: VitePluginTaroBuildContext, development = false): string {
    const wechatAppConfigCode = JSON.stringify(context.appConfig)
    const appComponentImport = toImportPath(context.appComponentFile)
    const refreshPreamble = development ? `import ${JSON.stringify(virtualWxRefreshPreambleId)}\n` : ''

    return `${refreshPreamble}import { createReactApp, ReactDOM } from ${JSON.stringify(wxShimImportPath)}
import React from 'react'
import AppComponent from ${JSON.stringify(appComponentImport)}

const appConfig = ${wechatAppConfigCode}
App(createReactApp(AppComponent, React, ReactDOM, appConfig))
`
}

/**
 * Builds a generated WeChat page entry that registers Taro's Page config.
 *
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-loader/src/page.ts#L52-L78
 */
export function createWxPageEntry(pageOption: VitePluginTaroPageOption, development = false): string {
    const wechatPageConfigCode = JSON.stringify(pageOption.config)
    const pageComponentImport = createPageComponentImport(pageOption.path)
    const developmentImport = development
        ? `import { decorateWxPageConfig, registerWxPage } from ${JSON.stringify(wxDevRuntimeImportPath)}\n`
        : ''
    const createConfig = `createPageConfig(PageComponent, '${pageOption.path}', { root: { cn: [] } }, pageConfig)`
    const pageRegistration = development
        ? `registerWxPage(${JSON.stringify(pageOption.path)}, () => Page(taroPageConfig))`
        : 'Page(taroPageConfig)'
    return `${developmentImport}import { createPageConfig } from ${JSON.stringify(wxShimImportPath)}
import PageComponent from ${JSON.stringify(pageComponentImport)}

const pageConfig = ${wechatPageConfigCode}
const taroPageConfig = ${development ? `decorateWxPageConfig(${createConfig})` : createConfig}
if (PageComponent && PageComponent.behaviors) {
  taroPageConfig.behaviors = (taroPageConfig.behaviors || []).concat(PageComponent.behaviors)
}
${pageRegistration}
`
}

function createWxRefreshPreamble(): string {
    return `import RefreshRuntime from '/@react-refresh'
RefreshRuntime.injectIntoGlobalHook(globalThis)
globalThis.$RefreshReg$ = () => {}
globalThis.$RefreshSig$ = () => (type) => type
`
}

function instrumentWxAppComponent(code: string, appFile: string): string {
    const transformed = transformSync(code, {
        babelrc: false,
        configFile: false,
        filename: appFile,
        plugins: [reactRefreshBabelPath],
        sourceMaps: false
    })?.code
    if (!transformed) throw new Error(`vite-plugin-taro could not instrument the WX App component ${appFile}.`)
    return `import {
    createSignatureFunctionForTransform as __wxCreateRefreshSignature,
    register as __wxRegisterRefreshType
} from '/@react-refresh'
const $RefreshReg$ = (type, id) => __wxRegisterRefreshType(type, ${JSON.stringify(`${appFile} `)} + id)
const $RefreshSig$ = __wxCreateRefreshSignature
${transformed}
if (import.meta.hot) import.meta.hot.accept()
`
}

function transformWxRefreshGlobals(code: string): string {
    return code
        .replaceAll('window.$Refresh', 'globalThis.$Refresh')
        .replaceAll('window.__registerBeforePerformReactRefresh', 'globalThis.__registerBeforePerformReactRefresh')
        .replaceAll('window.__getReactRefreshIgnoredExports', 'globalThis.__getReactRefreshIgnoredExports')
        .replace(
            'export function register(type, id) {',
            'export function register(type, id) {\n  if (globalThis.__WX_BLOCK_REFRESH_REGISTRATION__) return'
        )
        .replace('\n  performReactRefresh()\n', '\n  globalThis.__WX_AFTER_REACT_REFRESH__?.(performReactRefresh())\n')
}

/**
 * Builds the generated JS companion for comp.wxml/comp.json. Without it WeChat
 * can load recursive markup, but it will not have Taro's properties or `eh` event
 * dispatch method.
 *
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/template/comp.ts#L1-L4
 */
export function createWxCompEntry(): string {
    return `import { createRecursiveComponentConfig } from ${JSON.stringify(wxShimImportPath)}

Component(createRecursiveComponentConfig())
`
}

/**
 * Creates Taro-style Mini Program template/config/style companion files.
 *
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-platform-weapp/src/program.ts#L33-L55
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/plugins/MiniPlugin.ts#L1198-L1311
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/plugins/MiniPlugin.ts#L1346-L1390
 */
export function emitWechatAssets(
    emitter: WechatAssetEmitter,
    bundle: WechatBundle,
    context: VitePluginTaroBuildContext
): void {
    if (context.target !== 'wx') return
    for (const asset of createWechatAssets(bundle, context)) {
        emitter.emitFile({ type: 'asset', fileName: asset.fileName, source: asset.source })
    }
}

function createWechatAssets(
    bundle: WechatBundle,
    context: VitePluginTaroBuildContext
): { fileName: string; source: WechatAssetSource }[] {
    const builder = createWechatTemplateBuilder()

    return [
        { fileName: 'app.json', source: stringifyJsonAsset(context.appConfig) },
        { fileName: 'app.wxss', source: collectWechatBundleWxss(bundle) },
        { fileName: 'base.wxml', source: builder.buildTemplate(collectWechatTemplateComponentConfig(bundle)) },
        { fileName: 'utils.wxs', source: builder.buildXScript() },
        { fileName: 'comp.wxml', source: builder.buildBaseComponentTemplate('.wxml') },
        { fileName: 'comp.json', source: stringifyJsonAsset(createWechatCompJson()) },
        { fileName: 'project.config.json', source: stringifyJsonAsset(createWechatProjectConfig(context)) },
        { fileName: 'project.private.config.json', source: stringifyJsonAsset(context.projectPrivateConfigJson) },
        { fileName: 'sitemap.json', source: stringifyJsonAsset(context.sitemapJson) },
        ...context.pages.flatMap((page) => [
            {
                fileName: `${page.path}.wxml`,
                source: builder.buildPageTemplate(relativeWechatRootAssetFromPage(page.path, 'base.wxml'), {
                    content: page.config,
                    path: page.path
                })
            },
            {
                fileName: `${page.path}.json`,
                source: stringifyJsonAsset({
                    ...page.config,
                    usingComponents: {
                        comp: relativeWechatRootAssetFromPage(page.path, 'comp')
                    }
                })
            },
            { fileName: `${page.path}.wxss`, source: '' }
        ])
    ]
}

function createWechatProjectConfig(context: VitePluginTaroBuildContext): JsonObject {
    const setting = isJsonObject(context.projectConfigJson.setting) ? context.projectConfigJson.setting : {}
    return {
        ...context.projectConfigJson,
        setting: {
            ...setting,
            compileHotReLoad: true
        }
    }
}

function isJsonObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function createWechatTemplateBuilder() {
    const wechatPlatform = new WechatPlatform(
        { helper: { recursiveMerge }, modifyWebpackChain() {}, registerPlatform() {} },
        {},
        {}
    )
    wechatPlatform.modifyTemplate({})
    return wechatPlatform.template
}

/**
 * Computes a WeChat import path from a page file to a generated root asset.
 *
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/plugins/MiniPlugin.ts#L1270-L1298
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-helper/src/utils.ts#L74-L88
 */
function relativeWechatRootAssetFromPage(wechatPagePath: string, wechatRootAsset: string): string {
    const wechatPageDir = path.posix.dirname(wechatPagePath)
    const relativePath = path.posix.relative(wechatPageDir, wechatRootAsset)
    return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}

/**
 * Builds Taro's template component include config from official defaults plus
 * the component exports that Rolldown kept in the @tarojs/components bundle.
 *
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/utils/component.ts#L3-L8
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/plugins/TaroComponentsExportsPlugin.ts#L83-L124
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/plugins/TaroLoadChunksPlugin.ts#L165-L180
 */
function collectWechatTemplateComponentConfig(bundle: WechatBundle): WechatTemplateComponentConfig {
    const wechatComponentConfig: WechatTemplateComponentConfig = {
        includes: new Set([
            'view',
            'catch-view',
            'static-view',
            'pure-view',
            'click-view',
            'scroll-view',
            'image',
            'static-image',
            'text',
            'static-text'
        ]),
        exclude: new Set(),
        thirdPartyComponents: new Map(),
        includeAll: false
    }

    const wechatComponentsModule = findBundleModule(bundle, taroWechatComponentsReactPath)
    for (const item of wechatComponentsModule?.renderedExports ?? []) {
        wechatComponentConfig.includes.add(toDashed(item))
    }

    return wechatComponentConfig
}

function toDashed(s: string) {
    return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * Finds a module record inside the generated bundle by normalized module ID.
 *
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/plugins/TaroComponentsExportsPlugin.ts#L83-L124
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/plugins/TaroLoadChunksPlugin.ts#L165-L180
 */
function findBundleModule(bundle: WechatBundle, resolvedId: string): WechatBundleModule | undefined {
    const normalizedResolvedId = normalizeModuleId(resolvedId)
    for (const item of Object.values(bundle)) {
        if (item.type !== 'chunk') {
            continue
        }

        const found = Object.entries(item.modules ?? {}).find(([id]) => normalizeModuleId(id) === normalizedResolvedId)
        if (found) {
            return found[1]
        }
    }
}

/**
 * Creates the JSON config for Taro's shared recursive component.
 *
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/plugins/MiniPlugin.ts#L1228-L1252
 */
function createWechatCompJson(): JsonObject {
    return {
        component: true,
        styleIsolation: 'apply-shared',
        // Taro's recursive template can nest <comp />, so the component references
        // itself just like the official runner output.
        usingComponents: { comp: './comp' }
    }
}

/**
 * Converts a WeChat-emitted asset's source into text.
 */
function getWechatAssetSource(item: WechatBundleItem): string {
    if (typeof item.source === 'string') return item.source
    return item.source ? new TextDecoder().decode(item.source) : ''
}

/**
 * Flattens Vite-emitted CSS into app.wxss and removes the intermediate CSS asset.
 * This is vite-plugin-taro's Vite equivalent of Taro Webpack's app/common style consolidation.
 *
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/plugins/MiniPlugin.ts#L1310-L1311
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-webpack5-runner/src/plugins/MiniPlugin.ts#L1471-L1528
 */
function collectWechatBundleWxss(bundle: WechatBundle): string {
    const wechatWxssChunks: string[] = []
    for (const [fileName, item] of Object.entries(bundle)) {
        if (item.type !== 'asset' || !fileName.endsWith('.css')) continue
        const source = getWechatAssetSource(item)
        if (source) wechatWxssChunks.push(source)
        delete bundle[fileName]
    }
    return wechatWxssChunks.join('\n')
}

/**
 * Serializes generated Mini Program JSON assets; vite-plugin-taro pretty-prints non-prod output.
 */
function stringifyJsonAsset(value: JsonObject): string {
    return isProd ? JSON.stringify(value) : JSON.stringify(value, null, 2)
}
