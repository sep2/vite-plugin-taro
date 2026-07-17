import type { Rolldown } from 'vite'
import type { JsonObject, VitePluginTaroOptions } from '../../../../options.ts'

/** Creates every configured native JSON asset. */
export function createJsonAssets(options: VitePluginTaroOptions): Rolldown.EmittedAsset[] {
    return [
        createJsonAsset('app.json', createAppJson(options)),

        ...options.pages.map((page) => createJsonAsset(`${page.path}.json`, page.config)),

        createJsonAsset('project.config.json', options.projectConfigJson),

        ...(options.projectPrivateConfigJson
            ? [createJsonAsset('project.private.config.json', options.projectPrivateConfigJson)]
            : []),

        createJsonAsset('sitemap.json', options.sitemapJson)
    ]
}

/** Creates App JSON with the configured Page order as the authoritative pages field. */
export function createAppJson(options: VitePluginTaroOptions): JsonObject {
    return {
        ...options.appJson,
        pages: options.pages.map((page) => page.path)
    }
}

/** Serializes one native JSON object as a stable formatted asset. */
function createJsonAsset(fileName: string, value: JsonObject): Rolldown.EmittedAsset {
    return {
        type: 'asset',
        fileName,
        source: `${JSON.stringify(value, null, 4)}\n`
    }
}
