import path from 'node:path'
import type { VitePluginTaroOptions, VitePluginTaroPageOption } from '../../../options.ts'
import { escapeImport, toViteFileImportPath } from '../../utils/modules.ts'
import { resolvePackageFile } from '../../utils/packages.ts'
import { bootstrapEntryName } from './bootstrap/bootstrap-name.ts'
import { isVitePreload, overrideVitePreload } from './vite-preload/vite-preload.ts'

const resolvedVirtualModulePrefix = '\0'

const virtualWxAppDelegateId = 'virtual:vite-plugin-taro/wx/app'

const pageDelegateModulePrefix = 'virtual:vite-plugin-taro/wx/page/'

const wxBootstrapImportPath = toViteFileImportPath(resolvePackageFile('dist/runtime/wx/bootstrap.js'))

const wxTaroBridgeImportPath = toViteFileImportPath(resolvePackageFile('dist/runtime/wx/taro-bridge.js'))

/** Creates one Page delegate virtual ID. */
function createVirtualWxPageDelegateId(pagePath: string): string {
    return `${pageDelegateModulePrefix}${pagePath}`
}

/** Creates the WX bootstrap and delegate virtual modules. */
export function createWxVirtualModules(options: VitePluginTaroOptions) {
    const pageEntries = options.pages.map((option) => ({
        option,
        moduleId: createVirtualWxPageDelegateId(option.path)
    }))

    const pageByModuleId = new Map(pageEntries.map((page) => [page.moduleId, page.option]))

    const virtualModuleIds = new Set([virtualWxAppDelegateId, ...pageEntries.map((page) => page.moduleId)])

    return {
        input: Object.fromEntries([
            [bootstrapEntryName, wxBootstrapImportPath],
            ['root', virtualWxAppDelegateId],
            ...pageEntries.map((page) => [page.option.path, page.moduleId])
        ]) satisfies Record<string, string>,

        resolveId(id: string): string | undefined {
            if (virtualModuleIds.has(id)) return `${resolvedVirtualModulePrefix}${id}`
        },

        load(id: string, projectRoot: string): string | undefined {
            if (isVitePreload(id)) {
                return overrideVitePreload(id)
            }

            if (!id.startsWith(resolvedVirtualModulePrefix)) return

            const moduleId = id.slice(resolvedVirtualModulePrefix.length)
            if (moduleId === virtualWxAppDelegateId) {
                return createWxAppDelegateSource(options, projectRoot)
            }

            const page = pageByModuleId.get(moduleId)
            if (page) {
                return createWxPageDelegateSource(page, projectRoot)
            }
        }
    }
}

/** Generates the App delegate module. */
function createWxAppDelegateSource(options: VitePluginTaroOptions, projectRoot: string): string {
    const userAppPath = toViteFileImportPath(path.resolve(projectRoot, options.app))
    const appConfig = { ...options.appJson, pages: options.pages.map((page) => page.path) }

    return `import { createReactApp, ReactDOM } from ${escapeImport(wxTaroBridgeImportPath)}
import React from 'react'
import AppComponent from ${escapeImport(userAppPath)}
export default createReactApp(AppComponent, React, ReactDOM, ${JSON.stringify(appConfig)})`
}

/** Generates one Page delegate module. */
function createWxPageDelegateSource(page: VitePluginTaroPageOption, projectRoot: string): string {
    const userPagePath = toViteFileImportPath(path.resolve(projectRoot, 'src', `${page.path}.tsx`))

    return `import { createPageConfig } from ${escapeImport(wxTaroBridgeImportPath)}
import PageComponent from ${escapeImport(userPagePath)}
export default createPageConfig(PageComponent, ${JSON.stringify(page.path)}, { root: { cn: [] } }, ${JSON.stringify(page.config)})`
}
