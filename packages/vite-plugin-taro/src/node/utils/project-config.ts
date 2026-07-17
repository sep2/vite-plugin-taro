import type { JsonObject, VitePluginTaroOptions } from '../../options.ts'

/** Creates shared App configuration with configured Page order as the authoritative value. */
export function createAppConfig(options: VitePluginTaroOptions): JsonObject {
    return {
        ...options.appJson,
        pages: options.pages.map((page) => page.path)
    }
}
