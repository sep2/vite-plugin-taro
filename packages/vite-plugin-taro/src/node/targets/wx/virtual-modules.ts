/**
 * Defines the generated WX application graph.
 *
 * App, page, and component IDs become native entry chunks. The Refresh preamble is an App bootstrap module, while the
 * page-preload ID deliberately becomes its own development file with a later, page-only execution phase.
 */
import type { VitePluginTaroPageOption } from '../../../options.ts'
import type { BuildContext } from '../../build-context.ts'
import { createPageComponentImportPath, toViteFileImportPath } from '../../utils/modules.ts'
import { resolvePackageFile } from '../../utils/packages.ts'
import { wxPagePreloadFile } from './development-files.ts'
import { createWxReactRefreshPreambleSource } from './react-refresh.ts'

const wxTaroRuntimeImportPath = runtimeImportPath('taro-runtime.js')
const wxPageUpdateImportPath = runtimeImportPath('page-update.js')
const wxUpdateClientImportPath = runtimeImportPath('update-client.js')

/** Generated native App entry. */
export const virtualWxAppId = 'virtual:vite-plugin-taro/wx/app'

/** Generated recursive Taro component entry. */
export const virtualWxComponentId = 'virtual:vite-plugin-taro/wx/component'

/** Prefix for one generated native entry per configured page route. */
export const virtualWxPageIdPrefix = 'virtual:vite-plugin-taro/wx/page/'

/** App bootstrap module that installs React Refresh globals before application modules execute. */
export const virtualWxRefreshPreambleId = 'virtual:vite-plugin-taro/wx/refresh-preamble'

/** Development-only entry that initializes all configured page components before update replay. */
export const virtualWxPagePreloadId = 'virtual:vite-plugin-taro/wx/page-preload'

type WxChunkEmitter = {
    emitFile(chunk: { type: 'chunk'; id: string; fileName: string; implicitlyLoadedAfterOneOf: string[] }): string
}

export function isWxVirtualModuleId(id: string): boolean {
    return (
        id === virtualWxAppId ||
        id === virtualWxComponentId ||
        id === virtualWxRefreshPreambleId ||
        id === virtualWxPagePreloadId ||
        id.startsWith(virtualWxPageIdPrefix)
    )
}

export function loadWxVirtualModule(id: string, context: BuildContext): string | undefined {
    if (id === virtualWxRefreshPreambleId) return createWxReactRefreshPreambleSource()
    if (id === virtualWxAppId) return createWxAppEntrySource(context)
    if (id === virtualWxComponentId) return createWxComponentEntrySource()
    if (id === virtualWxPagePreloadId) return createWxPagePreloadSource(context)
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
    if (context.development) {
        emitter.emitFile({
            type: 'chunk',
            id: virtualWxPagePreloadId,
            fileName: wxPagePreloadFile,
            implicitlyLoadedAfterOneOf: [id]
        })
    }
}

function createWxAppEntrySource(context: BuildContext): string {
    const refreshPreamble = context.development ? `import ${JSON.stringify(virtualWxRefreshPreambleId)}\n` : ''
    const updateClient = context.development
        ? `import { startWxUpdateClient } from ${JSON.stringify(wxUpdateClientImportPath)}\n`
        : ''
    return `${refreshPreamble}${updateClient}import { createReactApp, ReactDOM } from ${JSON.stringify(wxTaroRuntimeImportPath)}
import React from 'react'
import AppComponent from ${JSON.stringify(toViteFileImportPath(context.project.appComponentFile))}

const appConfig = ${JSON.stringify(context.project.appConfig)}
App(createReactApp(AppComponent, React, ReactDOM, appConfig))
${context.development ? 'startWxUpdateClient()' : ''}
`
}

function createWxPageEntrySource(page: VitePluginTaroPageOption, context: BuildContext): string {
    const hotUpdateImport = context.development
        ? `import { decorateWxPageConfig, registerWxPage } from ${JSON.stringify(wxPageUpdateImportPath)}\n`
        : ''
    const createConfig = `createPageConfig(PageComponent, '${page.path}', { root: { cn: [] } }, pageConfig)`
    const pageRegistration = context.development
        ? `registerWxPage(${JSON.stringify(page.path)}, () => Page(taroPageConfig))`
        : 'Page(taroPageConfig)'
    return `${hotUpdateImport}import { createPageConfig } from ${JSON.stringify(wxTaroRuntimeImportPath)}
import PageComponent from ${JSON.stringify(createPageComponentImportPath(page.path))}

const pageConfig = ${JSON.stringify(page.config)}
const taroPageConfig = ${context.development ? `decorateWxPageConfig(${createConfig})` : createConfig}
if (PageComponent && PageComponent.behaviors) {
  taroPageConfig.behaviors = (taroPageConfig.behaviors || []).concat(PageComponent.behaviors)
}
${pageRegistration}
`
}

function createWxPagePreloadSource(context: BuildContext): string {
    const imports = context.project.pages.map((page, index) => {
        return `import Page${index} from ${JSON.stringify(createPageComponentImportPath(page.path))}`
    })
    return `${imports.join('\n')}\nvoid [${context.project.pages.map((_, index) => `Page${index}`).join(', ')}]\n`
}

function runtimeImportPath(fileName: string): string {
    return toViteFileImportPath(resolvePackageFile('dist/runtime/wx', fileName))
}

function createWxComponentEntrySource(): string {
    return `import { createRecursiveComponentConfig } from ${JSON.stringify(wxTaroRuntimeImportPath)}

Component(createRecursiveComponentConfig())
`
}
