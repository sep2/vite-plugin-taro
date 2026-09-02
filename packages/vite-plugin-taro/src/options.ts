/** A JSON object used by generated target configs. */
export type VptJsonObject = Record<string, unknown>

/** Build target handled by this plugin. */
export type VptTarget = 'wx' | 'zfb' | 'h5'

/** Selects one implemented WX development HMR delivery and execution mechanism. */
export type VptHmrOptions = Readonly<{
    /** `devtools` executes native patch files; `interpreter` fetches source and evaluates it without native Page reload. */
    mode: 'devtools' | 'interpreter'
}>

/** Configures one Taro page. */
export type VptPageOption = {
    /**
     * Taro route and output path without a file extension.
     *
     * The plugin resolves the page component from `src/${path}.tsx`, relative to the Vite project root. For example,
     * `pages/home/index` resolves to `src/pages/home/index.tsx` and is emitted under `pages/home/index` for `wx`.
     */
    path: string

    /**
     * Target-independent Taro page configuration.
     *
     * For `wx`, these values form the generated `<path>.json`; the plugin augments `usingComponents` with its generated
     * component registrations. For `h5`, the values are added to the corresponding Taro router entry.
     */
    config: VptJsonObject
}

/** Configures vpt for one build target. */
export interface VptOptions {
    /**
     * Platform produced by the current Vite invocation.
     *
     * Use `wx` to emit a WeChat Mini Program or `h5` to emit a browser application. The selected target controls Taro
     * module resolution, conditional compilation, runtime bootstrapping, style processing, and output generation.
     */
    target: VptTarget

    /**
     * Source module that default-exports the root React application component.
     *
     * Relative paths are resolved from Vite's project root, for example `src/app.tsx`. The component wraps the active
     * page through its `children` prop and is the appropriate place to import application-wide styles.
     */
    app: string

    /**
     * Complete ordered list of application pages.
     *
     * The declared order becomes the `pages` order in the generated `app.json`, the H5 route order, and the Page order
     * in the application style cascade. Each Page source is resolved according to its `path`.
     */
    pages: VptPageOption[]

    /**
     * Target-independent Taro application configuration.
     *
     * For `wx`, these values form the generated `app.json`. For `h5`, they configure the Taro application and router.
     * The plugin always derives `pages` from {@link pages}; caller-provided `pages`, `subPackages`, and `subpackages`
     * values are discarded because the build pipeline owns page order and generated package placement.
     */
    appJson: VptJsonObject

    /**
     * WeChat DevTools project configuration written to `project.config.json` without merging.
     *
     * This option is required so one configuration shape can be shared between targets, but it is only emitted for a
     * `wx` build and is ignored for `h5`.
     */
    projectConfigJson: VptJsonObject

    /**
     * Local WeChat DevTools overrides written to `project.private.config.json` without merging.
     *
     * The file is emitted only when this value is provided for a `wx` build. It is ignored for `h5`.
     */
    projectPrivateConfigJson?: VptJsonObject

    /**
     * WeChat Mini Program indexing rules written to `sitemap.json` without merging.
     *
     * The file is emitted only when this value is provided for a `wx` build. It is ignored for `h5`.
     */
    sitemapJson?: VptJsonObject

    /**
     * Selects the WX development HMR mode. Omission uses `devtools`.
     *
     * This option affects only `vite serve` for the `wx` target and never changes H5 or production output.
     */
    hmr?: VptHmrOptions
}
