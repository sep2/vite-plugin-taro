import path from 'node:path'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { escapeImport, toViteFileImportPath } from '../../../utils/modules.ts'
import { taroBridgeImportPath } from './entry.ts'

/** Renders the App entry module. */
export function renderAppEntry(options: VitePluginTaroOptions, projectRoot: string): string {
    const userAppPath = toViteFileImportPath(path.resolve(projectRoot, options.app))
    const appConfig = { ...options.appJson, pages: options.pages.map((page) => page.path) }

    return `import { createReactApp, ReactDOM } from ${escapeImport(taroBridgeImportPath)}
import React from 'react'
import AppComponent from ${escapeImport(userAppPath)}
export default createReactApp(AppComponent, React, ReactDOM, ${JSON.stringify(appConfig)})`
}
