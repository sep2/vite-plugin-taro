/** Defines the generated WX App and Page delegate entry modules. */
import path from 'node:path'
import type { VitePluginTaroOptions, VitePluginTaroPageOption } from '../../../../options.ts'
import { escapeImport, toViteFileImportPath } from '../../../utils/modules.ts'
import { resolvePackageFile } from '../../../utils/packages.ts'
import { isVitePreload, overrideVitePreload } from './vite-preload.ts'

// Vite's internal prefix prevents resolved virtual IDs from being treated as filesystem paths.
const resolvedVirtualModulePrefix = '\0'

// The native bootstrap is built as a plain WX CommonJS entry rather than a System capsule.
export const wxBootstrapEntryName = 'bootstrap'

// The root entry exports Taro's App delegate without calling the native App constructor.
const virtualWxAppDelegateId = 'virtual:vite-plugin-taro/wx/app'

// Every configured route receives its own delegate entry and native activation boundary.
const pageDelegateModulePrefix = 'virtual:vite-plugin-taro/wx/page/'

// The bootstrap owns the native SystemJS realm before any application capsule executes.
const wxBootstrapImportPath = toViteFileImportPath(resolvePackageFile('dist/runtime/wx/bootstrap.js'))

// Delegates share one Taro bridge instead of resolving framework internals independently.
const wxTaroBridgeImportPath = toViteFileImportPath(resolvePackageFile('dist/runtime/wx/taro-bridge.js'))

/** Creates the stable virtual module ID for one configured page route. */
function createVirtualWxPageDelegateId(pagePath: string): string {
    return `${pageDelegateModulePrefix}${pagePath}`
}

/** Creates the complete generated delegate module set and its Rolldown input map. */
export function createWxVirtualModules(options: VitePluginTaroOptions) {
    const pageEntries = options.pages.map((option) => ({
        option,
        moduleId: createVirtualWxPageDelegateId(option.path)
    }))

    const pageByModuleId = new Map(pageEntries.map((page) => [page.moduleId, page.option]))

    const virtualModuleIds = new Set([virtualWxAppDelegateId, ...pageEntries.map((page) => page.moduleId)])

    return {
        // Bootstrap, root, and route names become stable entries with Vite-owned module IDs.
        input: Object.fromEntries([
            [wxBootstrapEntryName, wxBootstrapImportPath],
            ['root', virtualWxAppDelegateId],
            ...pageEntries.map((page) => [page.option.path, page.moduleId])
        ]) satisfies Record<string, string>,

        // Claim only this configured project's generated delegate IDs.
        resolveId(id: string): string | undefined {
            if (virtualModuleIds.has(id)) return `${resolvedVirtualModulePrefix}${id}`
        },

        // Override Vite's browser preload runtime, then generate source for resolved delegate IDs.
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

/** Generates the module whose default export is the exact object returned by Taro's App factory. */
function createWxAppDelegateSource(options: VitePluginTaroOptions, projectRoot: string): string {
    const userAppPath = toViteFileImportPath(path.resolve(projectRoot, options.app))
    const appConfig = { ...options.appJson, pages: options.pages.map((page) => page.path) }

    return `import { createReactApp, ReactDOM } from ${escapeImport(wxTaroBridgeImportPath)}
import React from 'react'
import AppComponent from ${escapeImport(userAppPath)}
export default createReactApp(AppComponent, React, ReactDOM, ${JSON.stringify(appConfig)})`
}

/** Generates one route module whose default export is the exact object returned by Taro's Page factory. */
function createWxPageDelegateSource(page: VitePluginTaroPageOption, projectRoot: string): string {
    const userPagePath = toViteFileImportPath(path.resolve(projectRoot, 'src', `${page.path}.tsx`))

    return `import { createPageConfig } from ${escapeImport(wxTaroBridgeImportPath)}
import PageComponent from ${escapeImport(userPagePath)}
export default createPageConfig(PageComponent, ${JSON.stringify(page.path)}, { root: { cn: [] } }, ${JSON.stringify(page.config)})`
}
