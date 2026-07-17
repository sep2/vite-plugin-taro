import path from 'node:path'
import type { HtmlTagDescriptor } from 'vite'
import type { JsonObject, VitePluginTaroOptions, VitePluginTaroPageOption } from '../../../options.ts'
import { toViteFileImportPath } from '../../utils/modules.ts'
import { resolvePackageFile } from '../../utils/packages.ts'

const h5RuntimeImportPath = toViteFileImportPath(resolvePackageFile('dist/runtime/h5/taro-runtime.js'))
export const h5EntryId = 'virtual:vite-plugin-taro/h5'

/** Creates the module script that starts the generated H5 application. */
export function createH5IndexHtmlTags(): HtmlTagDescriptor[] {
    return [
        {
            tag: 'script',
            attrs: {
                type: 'module'
            },
            children: `import '${h5EntryId}'`,
            injectTo: 'body'
        }
    ]
}

/** Creates the generated H5 entry module. */
export function createH5EntrySource(options: VitePluginTaroOptions, projectRoot: string): string {
    const appConfig = JSON.stringify(createH5AppConfig(options))
    const routes = createH5RoutesSource(options.pages, projectRoot)
    const appComponentPath = toViteFileImportPath(path.resolve(projectRoot, options.app))

    return `import {
    createHashHistory,
    createReactApp,
    createRouter,
    handleAppMount,
    window
} from ${JSON.stringify(h5RuntimeImportPath)}
import React from 'react'
import ReactDOM from 'react-dom/client'
import AppComponent from ${JSON.stringify(appComponentPath)}

const config = window.__taroAppConfig = ${appConfig}
config.routes = ${routes}
const app = createReactApp(AppComponent, React, ReactDOM, config)
const history = createHashHistory({ window })
handleAppMount(config, history)
createRouter(history, app, config, React)
`
}

/** Creates the shared H5 App configuration. */
function createH5AppConfig(options: VitePluginTaroOptions): JsonObject {
    return {
        router: {},
        ...options.appJson,
        pages: options.pages.map((page) => page.path)
    }
}

/** Creates one lazy H5 route per configured Page. */
function createH5RoutesSource(pages: readonly VitePluginTaroPageOption[], projectRoot: string): string {
    const routes = pages.map((page) => {
        const pageComponentPath = toViteFileImportPath(path.resolve(projectRoot, 'src', `${page.path}.tsx`))
        return [
            'Object.assign({',
            `    path: ${JSON.stringify(page.path)},`,
            '    load: async function(context, params) {',
            `        const page = await import(${JSON.stringify(pageComponentPath)})`,
            '        return [page, context, params]',
            '    }',
            `}, ${JSON.stringify(page.config)})`
        ].join('\n')
    })
    return `[\n${routes.join(',\n')}\n]`
}
