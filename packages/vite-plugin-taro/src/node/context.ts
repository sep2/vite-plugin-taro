import path from 'node:path'
import type { JsonObject, VitePluginTaroOptions, VitePluginTaroPageOption, VitePluginTaroTarget } from '../options.ts'

export type VitePluginTaroBuildContext = {
    target: VitePluginTaroTarget
    appComponentFile: string
    pages: VitePluginTaroPageOption[]
    appConfig: JsonObject
    projectConfigJson: JsonObject
    projectPrivateConfigJson: JsonObject
    sitemapJson: JsonObject
}

/** Normalizes public options into immutable data shared by target plugins. */
export function createBuildContext(options: VitePluginTaroOptions): VitePluginTaroBuildContext {
    return {
        target: options.target,
        appComponentFile: path.resolve(options.app),
        pages: options.pages,
        appConfig: {
            ...options.appJson,
            pages: options.pages.map((page) => page.path)
        },
        projectConfigJson: options.projectConfigJson,
        projectPrivateConfigJson: options.projectPrivateConfigJson,
        sitemapJson: options.sitemapJson
    }
}
