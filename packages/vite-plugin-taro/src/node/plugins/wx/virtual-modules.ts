/** Defines the generated WX App and Page delegate entry modules. */
import path from 'node:path'
import type { VitePluginTaroOptions, VitePluginTaroPageOption } from '../../../options.ts'
import { escapeImport, toViteFileImportPath } from '../../utils/modules.ts'
import { resolvePackageFile } from '../../utils/packages.ts'
import { isVitePreload, overrideVitePreload } from './vite-preload.ts'

// Vite's internal prefix prevents resolved virtual IDs from being treated as filesystem paths.
const resolvedVirtualModulePrefix = '\0'

// The root entry exports Taro's App delegate without calling the native App constructor.
const virtualWxAppDelegateId = 'virtual:vite-plugin-taro/wx/app'

// Every configured route receives its own delegate entry and native activation boundary.
const pageDelegateModulePrefix = 'virtual:vite-plugin-taro/wx/page/'

// Delegates share the plugin-owned WX runtime instead of resolving Taro internals from the application.
const wxFoundationImportPath = toViteFileImportPath(resolvePackageFile('dist/runtime/wx/foundation.js'))

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
        // Root and route names become stable entry names while the values remain Vite-owned module IDs.
        input: Object.fromEntries([
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

    return `import { createReactApp, ReactDOM } from ${escapeImport(wxFoundationImportPath)}
import React from 'react'
import AppComponent from ${escapeImport(userAppPath)}
export default createReactApp(AppComponent, React, ReactDOM, ${JSON.stringify(appConfig)})`
}

/** Generates one route module whose default export is the exact object returned by Taro's Page factory. */
function createWxPageDelegateSource(page: VitePluginTaroPageOption, projectRoot: string): string {
    const userPagePath = toViteFileImportPath(path.resolve(projectRoot, 'src', `${page.path}.tsx`))

    return `import { createPageConfig } from ${escapeImport(wxFoundationImportPath)}
import PageComponent from ${escapeImport(userPagePath)}
export default createPageConfig(PageComponent, ${JSON.stringify(page.path)}, { root: { cn: [] } }, ${JSON.stringify(page.config)})`
}
