import type { Rolldown } from 'vite'
import type { JsonObject, VitePluginTaroOptions, VitePluginTaroPageOption } from '../../../../options.ts'
import { createAppConfig } from '../../../utils/project-config.ts'
import { relativeRootAsset } from './relative-root-asset.ts'

/** Creates every configured native JSON asset. */
export function createJsonAssets(options: VitePluginTaroOptions): Rolldown.EmittedAsset[] {
    return [
        createJsonAsset('app.json', createAppConfig(options)),

        ...options.pages.map((page) => createJsonAsset(`${page.path}.json`, createPageJson(page))),

        createJsonAsset('project.config.json', options.projectConfigJson),

        ...(options.projectPrivateConfigJson
            ? [createJsonAsset('project.private.config.json', options.projectPrivateConfigJson)]
            : []),

        createJsonAsset('sitemap.json', options.sitemapJson)
    ]
}

/** Creates Page JSON with Taro's recursive root component alongside user components. */
function createPageJson(page: VitePluginTaroPageOption): JsonObject {
    const usingComponents = isJsonObject(page.config.usingComponents) ? page.config.usingComponents : {}
    return {
        ...page.config,
        usingComponents: {
            ...usingComponents,
            comp: relativeRootAsset(page.path, 'comp')
        }
    }
}

/** Tests whether a configured JSON value can be merged as an object. */
function isJsonObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Serializes one native JSON object with stable formatting. */
export function renderJson(value: JsonObject): string {
    return `${JSON.stringify(value, null, 4)}\n`
}

/** Creates one native JSON asset. */
function createJsonAsset(fileName: string, value: JsonObject): Rolldown.EmittedAsset {
    return {
        type: 'asset',
        fileName,
        source: renderJson(value)
    }
}
