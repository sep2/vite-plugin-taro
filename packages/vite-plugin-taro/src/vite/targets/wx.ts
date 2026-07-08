import fs from 'node:fs'
import path from 'node:path'
import { recursiveMerge } from '@tarojs/helper'
import { Weapp as WechatPlatform } from '@tarojs/plugin-platform-weapp'
import type { ConfigEnv, Plugin, UserConfig } from 'vite'
import { isProd, nodeRequire, wxShimImportPath } from '../constants.ts'
import type { JsonObject, VitePluginTaroBuildContext, VitePluginTaroPageOption } from '../types.ts'
import { createPageComponentImport, normalizeModuleId } from '../utils.ts'

const virtualWxAppId = 'virtual:vite-plugin-taro/wx/app'
const virtualWxCompId = 'virtual:vite-plugin-taro/wx/comp'
const virtualWxPagePrefix = 'virtual:vite-plugin-taro/wx/page/'

/**
 * Checks whether an id belongs to a wx virtual module.
 */
export function isWxVirtualModuleId(id: string): boolean {
    return id === virtualWxAppId || id === virtualWxCompId || id.startsWith(virtualWxPagePrefix)
}

export function loadWxVirtualModule(cleanId: string, context: VitePluginTaroBuildContext): string | undefined {
    if (cleanId === virtualWxAppId) {
        return createWxAppEntry(context)
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
        return createWxPageEntry(page)
    }
}

const taroWechatComponentsReactPath = nodeRequire.resolve('@tarojs/plugin-platform-weapp/dist/components-react')
const vitePluginTaroSourcePath = normalizeModuleId(path.dirname(nodeRequire.resolve('vite-plugin-taro')))
const taroVersion = String(nodeRequire('@tarojs/runtime/package.json').version)

/**
 * Configures wx target entry, output, and chunk layout.
 */
export function createWxViteConfig(
    context: VitePluginTaroBuildContext,
    env?: ConfigEnv,
    userConfig: UserConfig = {}
): UserConfig {
    const isWechatDevBuild = isWechatBuildWatch(userConfig) || !isProd || (env ? env.mode !== 'production' : false)
    cleanWechatDevOutDirBeforeBuild(userConfig, env, isWechatDevBuild)

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
            emptyOutDir: isWechatDevBuild ? false : undefined,
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
                    codeSplitting: createWechatCodeSplitting(context, isWechatDevBuild)
                }
            }
        }
    }
}

/**
 * Removes unchanged files from watch bundles so Vite/Rolldown does not update their mtimes.
 * Combined with dev source-path chunks, this makes a page edit touch only the owning page/source JS file.
 */
export function createVitePluginTaroWechatMinimalWritePlugin(context: VitePluginTaroBuildContext): Plugin {
    let outDir = ''
    let sourceRoot = ''
    let enabled = false

    return {
        name: 'vite-plugin-taro-wx-minimal-write',
        enforce: 'post',
        configResolved(config) {
            outDir = path.resolve(config.root, config.build.outDir)
            sourceRoot = normalizeModuleId(path.resolve(config.root, 'src'))
            enabled = context.target === 'wx' && !!config.build.watch && config.build.write !== false
        },
        renderChunk(code, chunk) {
            if (!enabled || !isWechatSelfInitChunk(chunk.fileName, chunk.moduleIds, sourceRoot)) return null

            const selfInitializedCode = addWechatSelfInitCalls(code)
            return selfInitializedCode === code ? null : { code: selfInitializedCode, map: null }
        },
        generateBundle: {
            order: 'post',
            handler(_, bundle) {
                if (!enabled) return

                for (const [fileName, item] of Object.entries(bundle)) {
                    const filePath = path.join(outDir, ...fileName.split('/'))
                    if (isWechatOutputItemUnchanged(filePath, item)) delete bundle[fileName]
                }
            }
        }
    }
}

function isWechatBuildWatch(userConfig: UserConfig): boolean {
    return !!userConfig.build?.watch
}

function isWechatSelfInitChunk(fileName: string, moduleIds: string[], sourceRoot: string): boolean {
    return (
        fileName !== 'app.js' &&
        fileName !== 'comp.js' &&
        fileName !== 'runtime.js' &&
        !fileName.startsWith('common/') &&
        moduleIds.some((id) => isWechatProjectJavaScriptModule(id, sourceRoot))
    )
}

function isWechatProjectJavaScriptModule(id: string, sourceRoot: string): boolean {
    const fileId = toWechatModuleFileId(id)
    return isWechatJavaScriptSource(fileId) && isInsideWechatSourceRoot(fileId, sourceRoot)
}

function addWechatSelfInitCalls(code: string): string {
    const initNames = [
        ...new Set(
            [...code.matchAll(/Object\.defineProperty\(exports,\s*['"](init_[^'"]+)['"]/g)].map((match) => match[1])
        )
    ]
    if (!initNames.length) return code

    return `${code}\n${initNames.map((name) => `${name}();`).join('\n')}\n`
}

function cleanWechatDevOutDirBeforeBuild(
    userConfig: UserConfig,
    env: ConfigEnv | undefined,
    isWechatDevBuild: boolean
): void {
    if (!isWechatDevBuild || env?.command !== 'build' || userConfig.build?.write === false) return

    const root = path.resolve(process.cwd(), userConfig.root ?? '.')
    const outDir = path.resolve(root, userConfig.build?.outDir ?? 'dist')
    if (!shouldCleanWechatOutDir(root, outDir, userConfig)) return

    emptyWechatOutDir(outDir)
}

function shouldCleanWechatOutDir(root: string, outDir: string, userConfig: UserConfig): boolean {
    if (path.relative(root, outDir) === '') return false
    if (userConfig.build?.emptyOutDir === false) return false
    return userConfig.build?.emptyOutDir === true || isSameOrSubPath(root, outDir)
}

function emptyWechatOutDir(outDir: string): void {
    if (!fs.existsSync(outDir)) return

    for (const entry of fs.readdirSync(outDir)) {
        if (entry === 'project.config.json' || entry === 'project.private.config.json') continue
        fs.rmSync(path.join(outDir, entry), { recursive: true, force: true })
    }
}

function isSameOrSubPath(parent: string, child: string): boolean {
    const relative = path.relative(parent, child)
    return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

/**
 * Creates the wx JavaScript chunk layout.
 *
 * Production keeps a Taro-webpack-like coarse split. Development/watch uses uni-app-style Mini Program ownership:
 * dependencies stay in stable common chunks, while project source modules keep their source path as the chunk path.
 * This lets WeChat DevTools see page/source-file changes instead of a broad `common.js` change.
 *
 * https://github.com/dcloudio/uni-app/blob/d984f6c009acdf3973ed2d38924ffbc33a545571/packages/uni-mp-vite/src/plugin/build.ts#L248-L350
 * https://github.com/dcloudio/uni-app/blob/d984f6c009acdf3973ed2d38924ffbc33a545571/packages/uni-mp-vite/src/plugin/build.ts#L412-L455
 */
function createWechatCodeSplitting(context: VitePluginTaroBuildContext, isWechatDevBuild: boolean) {
    return {
        includeDependenciesRecursively: false,
        minSize: 0,
        groups: isWechatDevBuild ? createWechatDevCodeSplittingGroups(context) : createWechatProdCodeSplittingGroups()
    }
}

function createWechatProdCodeSplittingGroups() {
    return [
        { name: 'taro', test: isWxTaroChunkModule, priority: 100 },
        { name: 'vendors', test: isNodeModule, priority: 10 },
        { name: 'common', minShareCount: 2, minModuleSize: 1, priority: 1 }
    ]
}

function createWechatDevCodeSplittingGroups(context: VitePluginTaroBuildContext) {
    const sourceRoot = normalizeModuleId(path.resolve('src'))
    const entrySourceIds = createWechatEntrySourceIds(context)
    const reExportBarrelChunkNames = createWechatReExportBarrelChunkNameMap(sourceRoot)

    return [
        { name: 'common/taro', test: isWxTaroChunkModule, priority: 100 },
        { name: 'common/vendor', test: isNodeModule, priority: 50 },
        {
            name: (id: string) => createWechatProjectSourceChunkName(id, sourceRoot, reExportBarrelChunkNames),
            test: (id: string) => isWechatProjectSourceChunkCandidate(id, sourceRoot, entrySourceIds),
            minSize: 0,
            priority: 10
        }
    ]
}

function createWechatEntrySourceIds(context: VitePluginTaroBuildContext): Set<string> {
    return new Set([
        toWechatModuleFileId(context.appComponentImport),
        ...context.pages.map((page) => normalizeModuleId(path.resolve(`src/${page.path}.tsx`)))
    ])
}

function isWechatProjectSourceChunkCandidate(id: string, sourceRoot: string, entrySourceIds: Set<string>): boolean {
    const fileId = toWechatModuleFileId(id)
    return (
        isWechatJavaScriptSource(fileId) &&
        isInsideWechatSourceRoot(fileId, sourceRoot) &&
        !entrySourceIds.has(fileId) &&
        !fileId.includes('/node_modules/') &&
        !isWxVirtualModuleId(fileId)
    )
}

function createWechatProjectSourceChunkName(
    id: string,
    sourceRoot: string,
    reExportBarrelChunkNames: Map<string, string>
): string | null {
    const fileId = toWechatModuleFileId(id)
    const barrelChunkName = reExportBarrelChunkNames.get(fileId)
    if (barrelChunkName) return barrelChunkName
    if (!isInsideWechatSourceRoot(fileId, sourceRoot)) return null

    const relativePath = normalizeModuleId(path.relative(sourceRoot, fileId))
    return relativePath.replace(/\.[cm]?[jt]sx?$/, '')
}

function toWechatModuleFileId(id: string): string {
    const normalizedId = normalizeModuleId(id)
    return normalizedId.startsWith('/@fs/') ? normalizedId.slice('/@fs/'.length) : normalizedId
}

function isInsideWechatSourceRoot(id: string, sourceRoot: string): boolean {
    return id === sourceRoot || id.startsWith(`${sourceRoot}/`)
}

function isWechatJavaScriptSource(id: string): boolean {
    return /\.[cm]?[jt]sx?$/.test(id)
}

function createWechatReExportBarrelChunkNameMap(sourceRoot: string): Map<string, string> {
    const barrelChunkNames = new Map<string, string>()
    for (const fileId of collectWechatSourceFiles(sourceRoot)) {
        const source = fs.readFileSync(fileId, 'utf8')
        const reExportSpecifiers = [...source.matchAll(/^\s*export\s+\*\s+from\s+['"]([^'"]+)['"]/gm)]
        if (!reExportSpecifiers.length) continue

        const chunkName = createWechatSourceRelativeChunkName(fileId, sourceRoot)
        barrelChunkNames.set(fileId, chunkName)
        for (const match of reExportSpecifiers) {
            const resolvedFile = resolveWechatSourceImport(fileId, match[1])
            if (resolvedFile && isInsideWechatSourceRoot(resolvedFile, sourceRoot)) {
                barrelChunkNames.set(resolvedFile, chunkName)
            }
        }
    }
    return barrelChunkNames
}

function collectWechatSourceFiles(sourceRoot: string): string[] {
    if (!fs.existsSync(sourceRoot)) return []

    const sourceFiles: string[] = []
    for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
        const entryPath = path.join(sourceRoot, entry.name)
        if (entry.isDirectory()) {
            sourceFiles.push(...collectWechatSourceFiles(entryPath))
        } else if (entry.isFile() && isWechatJavaScriptSource(entryPath)) {
            sourceFiles.push(normalizeModuleId(entryPath))
        }
    }
    return sourceFiles
}

function resolveWechatSourceImport(importer: string, specifier: string): string | undefined {
    if (!specifier.startsWith('.')) return

    const basePath = path.resolve(path.dirname(importer), specifier)
    for (const candidate of createWechatSourceImportCandidates(basePath)) {
        if (fs.existsSync(candidate)) return normalizeModuleId(candidate)
    }
}

function createWechatSourceImportCandidates(basePath: string): string[] {
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']
    if (extensions.some((extension) => basePath.endsWith(extension))) return [basePath]
    return extensions.flatMap((extension) => [basePath + extension, path.join(basePath, `index${extension}`)])
}

function createWechatSourceRelativeChunkName(fileId: string, sourceRoot: string): string {
    return normalizeModuleId(path.relative(sourceRoot, fileId)).replace(/\.[cm]?[jt]sx?$/, '')
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
    code?: string
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
export function createWxAppEntry(context: VitePluginTaroBuildContext): string {
    const wechatAppConfigCode = JSON.stringify(context.appConfig)

    return `import { createReactApp, ReactDOM } from ${JSON.stringify(wxShimImportPath)}
import React from 'react'
import AppComponent from ${JSON.stringify(context.appComponentImport)}

const appConfig = ${wechatAppConfigCode}
App(createReactApp(AppComponent, React, ReactDOM, appConfig))
`
}

/**
 * Builds a generated WeChat page entry that registers Taro's Page config.
 *
 * https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-loader/src/page.ts#L52-L78
 */
export function createWxPageEntry(pageOption: VitePluginTaroPageOption): string {
    const wechatPageConfigCode = JSON.stringify(pageOption.config)
    const pageComponentImport = createPageComponentImport(pageOption.path)
    return `import { createPageConfig } from ${JSON.stringify(wxShimImportPath)}
import PageComponent from ${JSON.stringify(pageComponentImport)}

const pageConfig = ${wechatPageConfigCode}
const taroPageConfig = createPageConfig(PageComponent, '${pageOption.path}', { root: { cn: [] } }, pageConfig)
if (PageComponent && PageComponent.behaviors) {
  taroPageConfig.behaviors = (taroPageConfig.behaviors || []).concat(PageComponent.behaviors)
}
Page(taroPageConfig)
`
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
        { fileName: 'project.config.json', source: stringifyJsonAsset(context.projectConfigJson) },
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

function isWechatOutputItemUnchanged(filePath: string, item: WechatBundleItem): boolean {
    if (!fs.existsSync(filePath)) return false
    return fs.readFileSync(filePath).equals(getWechatOutputItemSource(item))
}

function getWechatOutputItemSource(item: WechatBundleItem): Buffer {
    if (item.type === 'chunk') return Buffer.from(item.code ?? '')
    if (typeof item.source === 'string') return Buffer.from(item.source)
    return item.source ? Buffer.from(item.source) : Buffer.from('')
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
