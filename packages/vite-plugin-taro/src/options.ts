/** Plain JSON object emitted into Mini Program/Web config payloads. */
export type JsonObject = Record<string, unknown>

/** Build target handled by this plugin. */
export type VitePluginTaroTarget = 'wx' | 'h5'

/** Describes one React-backed page shared by WeChat Mini Program and Web builds. */
export type VitePluginTaroPageOption = {
    /** Taro route and output path without a file extension. */
    path: string

    /** Page config merged into the generated target config. */
    config: JsonObject
}

/** Required build inputs for the Vite/Rolldown Taro renderer plugin. */
export interface VitePluginTaroOptions {
    target: VitePluginTaroTarget
    app: string
    pages: VitePluginTaroPageOption[]
    appJson: JsonObject
    projectConfigJson: JsonObject
    projectPrivateConfigJson?: JsonObject
    sitemapJson: JsonObject
}
