/** One immutable JSON value accepted by generated target configuration files. */
export type VptJsonValue = string | number | boolean | null | VptJsonObject | readonly VptJsonValue[]

/** An immutable JSON object transformed and emitted by vpt. */
export interface VptJsonObject {
    readonly [key: string]: VptJsonValue | undefined
}

/** Canonical Taro-shaped application configuration transformed by the selected target adapter. */
export type VptAppConfig = VptJsonObject

/** Canonical Taro-shaped Page configuration transformed by the selected target adapter. */
export type VptPageConfig = VptJsonObject

/** Build target handled by this plugin. */
export type VptTarget = 'wx' | 'zfb' | 'h5'

/** Selects one implemented Mini Program HMR delivery and execution mechanism. */
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
     * `pages/home/index` resolves to `src/pages/home/index.tsx` and keeps that output route for every target.
     */
    path: string

    /**
     * Canonical Taro Page configuration. Use the same WeChat-shaped keys accepted by `definePageConfig`.
     *
     * WX emits these values directly. ZFB recursively converts them to Alipay configuration keys before specializing the
     * runtime capsule and emitting `<path>.json`. H5 adds them to the corresponding router entry.
     */
    config: VptPageConfig
}

/** Configures vpt for one build target. */
export interface VptOptions {
    /**
     * Platform produced by the current Vite invocation.
     *
     * Use `wx` to emit a WeChat Mini Program, `zfb` to emit an Alipay Mini Program, or `h5` to emit a browser application.
     * The selected target controls Taro module resolution, conditional compilation, runtime bootstrapping, style processing,
     * and output generation.
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
     * Canonical Taro application configuration. Use the same WeChat-shaped keys accepted by `defineAppConfig`.
     *
     * WX emits these values directly. ZFB recursively converts them to Alipay configuration keys before runtime
     * specialization and JSON emission. H5 uses them to configure the Taro application and router. The plugin always derives
     * `pages` from {@link pages}; caller-provided `pages`, `subPackages`, and `subpackages` values are discarded because the
     * build pipeline owns page order and generated package placement.
     */
    appJson: VptAppConfig

    /**
     * Native development-tool project configuration written without merging.
     *
     * WX emits this object as `project.config.json`; ZFB emits it as `mini.project.json`; H5 ignores it. Supply the schema
     * expected by the selected target rather than sharing one project's platform-specific values across invocations.
     */
    projectConfigJson: VptJsonObject

    /**
     * Local WeChat DevTools overrides written to `project.private.config.json` without merging.
     *
     * The file is emitted only when this value is provided for a `wx` build. It is ignored for ZFB and H5.
     */
    projectPrivateConfigJson?: VptJsonObject

    /**
     * WeChat Mini Program indexing rules written to `sitemap.json` without merging.
     *
     * The file is emitted only when this value is provided for a `wx` build. It is ignored for ZFB and H5.
     */
    sitemapJson?: VptJsonObject

    /**
     * Selects the Mini Program development HMR mode. Omission uses `devtools`.
     *
     * This option affects only `vite serve` for `wx` and `zfb` targets and never changes H5 or production output.
     */
    hmr?: VptHmrOptions
}
