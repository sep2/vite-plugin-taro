/** Defines the generated native WX application graph. */
import type { VitePluginTaroPageOption } from '../../../options.ts'
import type { BuildContext } from '../../build-context.ts'
import { createPageComponentImportPath, toViteFileImportPath } from '../../utils/modules.ts'
import { resolvePackageFile } from '../../utils/packages.ts'

const wxTaroRuntimeImportPath = runtimeImportPath('taro-runtime.js')

/** Generated native App entry. */
export const virtualWxAppId = 'virtual:vite-plugin-taro/wx/app'

/** Generated recursive Taro component entry. */
const virtualWxComponentId = 'virtual:vite-plugin-taro/wx/component'

/** Prefix for one generated native entry per configured page route. */
const virtualWxPageIdPrefix = 'virtual:vite-plugin-taro/wx/page/'

type WxChunkEmitter = {
    emitFile(chunk: { type: 'chunk'; id: string; fileName: string; implicitlyLoadedAfterOneOf: string[] }): string
}

export function isWxVirtualModuleId(id: string): boolean {
    return id === virtualWxAppId || id === virtualWxComponentId || id.startsWith(virtualWxPageIdPrefix)
}

export function loadWxVirtualModule(id: string, context: BuildContext): string | undefined {
    if (id === virtualWxAppId) {
        return createWxAppEntrySource(context)
    }
    if (id === virtualWxComponentId) {
        return createWxComponentEntrySource()
    }
    if (id.startsWith(virtualWxPageIdPrefix)) {
        const pagePath = id.slice(virtualWxPageIdPrefix.length)

        const page = context.project.pages.find((candidate) => candidate.path === pagePath)
        if (page) {
            return createWxPageEntrySource(page)
        }
    }
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
    return `import { createReactApp, ReactDOM } from ${JSON.stringify(wxTaroRuntimeImportPath)}
import React from 'react'
import AppComponent from ${JSON.stringify(toViteFileImportPath(context.project.appComponentFile))}

const appConfig = ${JSON.stringify(context.project.appConfig)}
App(createReactApp(AppComponent, React, ReactDOM, appConfig))
`
}

function createWxPageEntrySource(page: VitePluginTaroPageOption): string {
    return `import { createPageConfig } from ${JSON.stringify(wxTaroRuntimeImportPath)}
import PageComponent from ${JSON.stringify(createPageComponentImportPath(page.path))}

const pageConfig = ${JSON.stringify(page.config)}
const taroPageConfig = createPageConfig(PageComponent, '${page.path}', { root: { cn: [] } }, pageConfig)
if (PageComponent && PageComponent.behaviors) {
  taroPageConfig.behaviors = (taroPageConfig.behaviors || []).concat(PageComponent.behaviors)
}
Page(taroPageConfig)
`
}

function runtimeImportPath(fileName: string): string {
    return toViteFileImportPath(resolvePackageFile('dist/runtime/wx', fileName))
}

function createWxComponentEntrySource(): string {
    return `import { createRecursiveComponentConfig } from ${JSON.stringify(wxTaroRuntimeImportPath)}

Component(createRecursiveComponentConfig())
`
}
