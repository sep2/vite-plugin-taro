/** Plain JSON object emitted into Mini Program/Web config payloads. */
export type JsonObject = Record<string, unknown>

/** Build target handled by this plugin. */
export type VitePluginTaroTarget = 'wx' | 'h5'

/** Describes one React-backed page shared by WeChat Mini Program and Web builds. */
export type VitePluginTaroPageOption = {
    /**
     * Page route and output path, without file extension.
     * Example: "pages/index/index" emits pages/index/index.{js,json,wxml,wxss}
     * for WeChat and becomes the Web router path.
     */
    path: string

    /** Page JSON config merged into WeChat JSON and Web route config. */
    config: JsonObject
}

/** Required build inputs for the custom Vite/Rolldown Taro renderer plugin. */
export interface VitePluginTaroOptions {
    /** Active target for this Vite invocation. */
    target: VitePluginTaroTarget

    /** Source file that default-exports the root React app component. */
    app: string

    /** Ordered page list; also becomes app.json.pages and Web route order. */
    pages: VitePluginTaroPageOption[]

    /** Base app.json content. Its pages field is overwritten from options.pages. */
    appJson: JsonObject

    /** project.config.json content emitted at the Mini Program root. */
    projectConfigJson: JsonObject

    /** project.private.config.json content emitted at the Mini Program root. */
    projectPrivateConfigJson: JsonObject

    /** sitemap.json content emitted at the Mini Program root. */
    sitemapJson: JsonObject
}

export type VitePluginTaroBuildContext = {
    target: VitePluginTaroTarget
    appComponentFile: string
    pages: VitePluginTaroPageOption[]
    appConfig: JsonObject
    projectConfigJson: JsonObject
    projectPrivateConfigJson: JsonObject
    sitemapJson: JsonObject
}
