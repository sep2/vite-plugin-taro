import type { HtmlTagDescriptor } from 'vite'
import type { JsonObject, VitePluginTaroPageOption } from '../../../options.ts'
import type { VitePluginTaroBuildContext } from '../../context.ts'
import { createPageComponentImport, toImportPath } from '../../module-paths.ts'
import { h5RuntimeImportPath } from '../../runtime-paths.ts'

export const virtualH5Id = 'virtual:vite-plugin-taro/h5'

export function isH5VirtualModule(id: string): boolean {
    return id === virtualH5Id
}

export function loadH5VirtualModule(cleanId: string, context: VitePluginTaroBuildContext): string | undefined {
    if (cleanId === virtualH5Id) return createWebEntry(context)
}

export function createWebIndexHtmlTags(context: VitePluginTaroBuildContext): HtmlTagDescriptor[] | undefined {
    if (context.target !== 'h5') return
    return [
        {
            tag: 'script',
            attrs: { type: 'module' },
            children: `import '${virtualH5Id}'`,
            injectTo: 'body'
        }
    ]
}

function createWebEntry(context: VitePluginTaroBuildContext): string {
    const appConfig = JSON.stringify(createWebAppConfig(context.appConfig))
    const routes = createWebRoutesConfig(context.pages)
    return `import {
    createHashHistory,
    createReactApp,
    createRouter,
    handleAppMount,
    window
} from ${JSON.stringify(h5RuntimeImportPath)}
import React from 'react'
import ReactDOM from 'react-dom/client'
import AppComponent from ${JSON.stringify(toImportPath(context.appComponentFile))}

const config = window.__taroAppConfig = ${appConfig}
config.routes = ${routes}
const app = createReactApp(AppComponent, React, ReactDOM, config)
const history = createHashHistory({ window })
handleAppMount(config, history)
createRouter(history, app, config, React)
`
}

function createWebAppConfig(sharedAppConfig: JsonObject): JsonObject {
    return { router: {}, ...sharedAppConfig }
}

function createWebRoutesConfig(pages: VitePluginTaroPageOption[]): string {
    const routes = pages.map((page) =>
        [
            'Object.assign({',
            `  path: ${JSON.stringify(page.path)},`,
            '  load: async function(context, params) {',
            `    const page = await import(${JSON.stringify(createPageComponentImport(page.path))})`,
            '    return [page, context, params]',
            '  }',
            `}, ${JSON.stringify(page.config)})`
        ].join('\n')
    )
    return `[\n${routes.join(',\n')}\n]`
}
