import type { VitePluginTaroPageOption } from '../../../options.ts'
import type { BuildContext } from '../../build-context.ts'
import { createPageComponentImportPath, toViteFileImportPath } from '../../module-paths.ts'
import { wxHotUpdateRuntimeImportPath, wxRuntimeBridgeImportPath } from '../../package-paths.ts'
import { createWxReactRefreshPreambleSource } from './react-refresh.ts'

export const virtualWxAppId = 'virtual:vite-plugin-taro/wx/app'
export const virtualWxComponentId = 'virtual:vite-plugin-taro/wx/comp'
export const virtualWxPageIdPrefix = 'virtual:vite-plugin-taro/wx/page/'
export const virtualWxRefreshPreambleId = 'virtual:vite-plugin-taro/wx/refresh-preamble'

type WxChunkEmitter = {
    emitFile(chunk: { type: 'chunk'; id: string; fileName: string; implicitlyLoadedAfterOneOf: string[] }): string
}

export function isWxVirtualModuleId(id: string): boolean {
    return (
        id === virtualWxAppId ||
        id === virtualWxComponentId ||
        id === virtualWxRefreshPreambleId ||
        id.startsWith(virtualWxPageIdPrefix)
    )
}

export function loadWxVirtualModule(id: string, context: BuildContext): string | undefined {
    if (id === virtualWxRefreshPreambleId) return createWxReactRefreshPreambleSource()
    if (id === virtualWxAppId) return createWxAppEntrySource(context)
    if (id === virtualWxComponentId) return createWxComponentEntrySource()
    if (!id.startsWith(virtualWxPageIdPrefix)) return
    const pagePath = id.slice(virtualWxPageIdPrefix.length)
    const page = context.project.pages.find((candidate) => candidate.path === pagePath)
    if (page) return createWxPageEntrySource(page, context)
}

/** Registers every configured page and the shared recursive component as eager WX entry chunks. */
export function emitWxEntryChunks(emitter: WxChunkEmitter, context: BuildContext, id: string): void {
    if (id !== virtualWxAppId) return
    for (const page of context.project.pages) {
        emitter.emitFile({
            type: 'chunk',
            id: `${virtualWxPageIdPrefix}${page.path}`,
            fileName: `${page.path}.js`,
            implicitlyLoadedAfterOneOf: [id]
        })
    }
    emitter.emitFile({
        type: 'chunk',
        id: virtualWxComponentId,
        fileName: 'comp.js',
        implicitlyLoadedAfterOneOf: [id]
    })
}

function createWxAppEntrySource(context: BuildContext): string {
    const refreshPreamble = context.behavior.reactRefresh
        ? `import ${JSON.stringify(virtualWxRefreshPreambleId)}\n`
        : ''
    return `${refreshPreamble}import { createReactApp, ReactDOM } from ${JSON.stringify(wxRuntimeBridgeImportPath)}
import React from 'react'
import AppComponent from ${JSON.stringify(toViteFileImportPath(context.project.appComponentFile))}

const appConfig = ${JSON.stringify(context.project.appConfig)}
App(createReactApp(AppComponent, React, ReactDOM, appConfig))
`
}

function createWxPageEntrySource(page: VitePluginTaroPageOption, context: BuildContext): string {
    const hotUpdateImport = context.behavior.reactRefresh
        ? `import { decorateWxPageConfig, registerWxPage } from ${JSON.stringify(wxHotUpdateRuntimeImportPath)}\n`
        : ''
    const createConfig = `createPageConfig(PageComponent, '${page.path}', { root: { cn: [] } }, pageConfig)`
    const pageRegistration = context.behavior.reactRefresh
        ? `registerWxPage(${JSON.stringify(page.path)}, () => Page(taroPageConfig))`
        : 'Page(taroPageConfig)'
    return `${hotUpdateImport}import { createPageConfig } from ${JSON.stringify(wxRuntimeBridgeImportPath)}
import PageComponent from ${JSON.stringify(createPageComponentImportPath(page.path))}

const pageConfig = ${JSON.stringify(page.config)}
const taroPageConfig = ${context.behavior.reactRefresh ? `decorateWxPageConfig(${createConfig})` : createConfig}
if (PageComponent && PageComponent.behaviors) {
  taroPageConfig.behaviors = (taroPageConfig.behaviors || []).concat(PageComponent.behaviors)
}
${pageRegistration}
`
}

function createWxComponentEntrySource(): string {
    return `import { createRecursiveComponentConfig } from ${JSON.stringify(wxRuntimeBridgeImportPath)}

Component(createRecursiveComponentConfig())
`
}
