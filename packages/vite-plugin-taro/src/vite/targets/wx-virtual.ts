import { transformSync } from '@babel/core'
import { nodeRequire, wxDevRuntimeImportPath, wxShimImportPath } from '../constants.ts'
import type { VitePluginTaroBuildContext, VitePluginTaroPageOption } from '../types.ts'
import { createPageComponentImport, normalizeModuleId, toImportPath } from '../utils.ts'

export const virtualWxAppId = 'virtual:vite-plugin-taro/wx/app'
export const virtualWxCompId = 'virtual:vite-plugin-taro/wx/comp'
export const virtualWxPagePrefix = 'virtual:vite-plugin-taro/wx/page/'
export const virtualWxRefreshPreambleId = 'virtual:vite-plugin-taro/wx/refresh-preamble'

const reactRefreshBabelPath = nodeRequire.resolve('react-refresh/babel')

type WechatChunkEmitter = {
    emitFile(chunk: { type: 'chunk'; id: string; fileName: string; implicitlyLoadedAfterOneOf: string[] }): string
}

export function isWxVirtualModule(id: string): boolean {
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
    development: boolean
): string | undefined {
    if (cleanId === virtualWxRefreshPreambleId) return createWxRefreshPreamble()
    if (cleanId === virtualWxAppId) return createWxAppEntry(context, development)
    if (cleanId === virtualWxCompId) return createWxCompEntry()
    if (!cleanId.startsWith(virtualWxPagePrefix)) return
    const pagePath = cleanId.slice(virtualWxPagePrefix.length)
    const page = context.pages.find((candidate) => candidate.path === pagePath)
    if (page) return createWxPageEntry(page, development)
}

export function emitWxImplicitChunks(
    emitter: WechatChunkEmitter,
    context: VitePluginTaroBuildContext,
    cleanId: string
): void {
    if (cleanId !== virtualWxAppId) return
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

export function transformWxDevelopmentModule(code: string, id: string, appComponentFile: string): string {
    const appFile = normalizeModuleId(appComponentFile)
    const instrumented = normalizeModuleId(id) === appFile ? instrumentWxAppComponent(code, appFile) : code
    return instrumented
        .replaceAll('window.$Refresh', 'globalThis.$Refresh')
        .replaceAll('window.__registerBeforePerformReactRefresh', 'globalThis.__registerBeforePerformReactRefresh')
        .replaceAll('window.__getReactRefreshIgnoredExports', 'globalThis.__getReactRefreshIgnoredExports')
        .replace(
            'export function register(type, id) {',
            'export function register(type, id) {\n  if (globalThis.__VITE_PLUGIN_TARO_WX__?.blockRefreshRegistration) return'
        )
        .replace(
            '\n  performReactRefresh()\n',
            '\n  globalThis.__VITE_PLUGIN_TARO_WX__?.afterRefresh?.(performReactRefresh())\n'
        )
}

function createWxAppEntry(context: VitePluginTaroBuildContext, development: boolean): string {
    const refreshPreamble = development ? `import ${JSON.stringify(virtualWxRefreshPreambleId)}\n` : ''
    return `${refreshPreamble}import { createReactApp, ReactDOM } from ${JSON.stringify(wxShimImportPath)}
import React from 'react'
import AppComponent from ${JSON.stringify(toImportPath(context.appComponentFile))}

const appConfig = ${JSON.stringify(context.appConfig)}
App(createReactApp(AppComponent, React, ReactDOM, appConfig))
`
}

function createWxPageEntry(page: VitePluginTaroPageOption, development: boolean): string {
    const developmentImport = development
        ? `import { decorateWxPageConfig, registerWxPage } from ${JSON.stringify(wxDevRuntimeImportPath)}\n`
        : ''
    const createConfig = `createPageConfig(PageComponent, '${page.path}', { root: { cn: [] } }, pageConfig)`
    const pageRegistration = development
        ? `registerWxPage(${JSON.stringify(page.path)}, () => Page(taroPageConfig))`
        : 'Page(taroPageConfig)'
    return `${developmentImport}import { createPageConfig } from ${JSON.stringify(wxShimImportPath)}
import PageComponent from ${JSON.stringify(createPageComponentImport(page.path))}

const pageConfig = ${JSON.stringify(page.config)}
const taroPageConfig = ${development ? `decorateWxPageConfig(${createConfig})` : createConfig}
if (PageComponent && PageComponent.behaviors) {
  taroPageConfig.behaviors = (taroPageConfig.behaviors || []).concat(PageComponent.behaviors)
}
${pageRegistration}
`
}

function createWxCompEntry(): string {
    return `import { createRecursiveComponentConfig } from ${JSON.stringify(wxShimImportPath)}

Component(createRecursiveComponentConfig())
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
