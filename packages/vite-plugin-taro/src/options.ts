/** A JSON object used by generated target configs. */
export type JsonObject = Record<string, unknown>

/** Build target handled by this plugin. */
export type VitePluginTaroTarget = 'wx' | 'h5'

/** Configures one Taro page. */
export type VitePluginTaroPageOption = {
    /** Taro route and output path without a file extension. */
    path: string

    config: JsonObject
}

/** Configures the Vite Taro plugin. */
export interface VitePluginTaroOptions {
    target: VitePluginTaroTarget
    app: string
    pages: VitePluginTaroPageOption[]
    appJson: JsonObject
    projectConfigJson: JsonObject
    projectPrivateConfigJson?: JsonObject
    sitemapJson: JsonObject
}
