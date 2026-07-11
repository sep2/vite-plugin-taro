import type { HtmlTagDescriptor } from 'vite'
import type { JsonObject, VitePluginTaroPageOption } from '../../../options.ts'
import type { BuildContext } from '../../build-context.ts'
import { createPageComponentImportPath, toViteFileImportPath } from '../../utils/modules.ts'
import { resolvePackageFile } from '../../utils/packages.ts'

const h5TaroRuntimeImportPath = toViteFileImportPath(resolvePackageFile('dist/runtime/h5/taro-runtime.js'))

export const virtualH5EntryId = 'virtual:vite-plugin-taro/h5'

export function isH5VirtualModuleId(id: string): boolean {
    return id === virtualH5EntryId
}

export function loadH5VirtualModule(id: string, context: BuildContext): string | undefined {
    if (id === virtualH5EntryId) return createH5EntrySource(context)
}

export function createH5IndexHtmlTags(context: BuildContext): HtmlTagDescriptor[] | undefined {
    if (context.project.target !== 'h5') return
    return [
        {
            tag: 'script',
            attrs: { type: 'module' },
            children: `import '${virtualH5EntryId}'`,
            injectTo: 'body'
        }
    ]
}

function createH5EntrySource(context: BuildContext): string {
    const appConfig = JSON.stringify(createH5AppConfig(context.project.appConfig))
    const routes = createH5RoutesSource(context.project.pages)
    return `import {
    createHashHistory,
    createReactApp,
    createRouter,
    handleAppMount,
    window
} from ${JSON.stringify(h5TaroRuntimeImportPath)}
import React from 'react'
import ReactDOM from 'react-dom/client'
import AppComponent from ${JSON.stringify(toViteFileImportPath(context.project.appComponentFile))}

const config = window.__taroAppConfig = ${appConfig}
config.routes = ${routes}
const app = createReactApp(AppComponent, React, ReactDOM, config)
const history = createHashHistory({ window })
handleAppMount(config, history)
createRouter(history, app, config, React)
`
}

function createH5AppConfig(sharedAppConfig: JsonObject): JsonObject {
    return { router: {}, ...sharedAppConfig }
}

function createH5RoutesSource(pages: readonly VitePluginTaroPageOption[]): string {
    const routes = pages.map((page) =>
        [
            'Object.assign({',
            `  path: ${JSON.stringify(page.path)},`,
            '  load: async function(context, params) {',
            `    const page = await import(${JSON.stringify(createPageComponentImportPath(page.path))})`,
            '    return [page, context, params]',
            '  }',
            `}, ${JSON.stringify(page.config)})`
        ].join('\n')
    )
    return `[\n${routes.join(',\n')}\n]`
}
