/** One immutable JSON value accepted by generated target configuration files. */
export type VptJsonValue = string | number | boolean | null | VptJsonObject | readonly VptJsonValue[]

/** An immutable JSON object accepted by vpt configuration. */
export interface VptJsonObject {
    readonly [key: string]: VptJsonValue | undefined
}

/** Application configuration written in the selected target's native schema. */
export type VptAppConfig = VptJsonObject

/** Page configuration written in the selected target's native schema. */
export type VptPageConfig = VptJsonObject

/** Build target handled by this plugin. */
export type VptTarget = 'wx' | 'zfb' | 'h5'

/** Selects one implemented Mini Program development update mechanism. */
export type VptHmrOptions = Readonly<{
    /**
     * `devtools` executes native patch files; `interpreter` evaluates pushed source without native Page reload; `rebuild`
     * replaces the complete native output after every valid source change.
     */
    mode: 'devtools' | 'interpreter' | 'rebuild'
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
     * Optional native Page configuration for the selected target.
     *
     * Use Taro/WeChat keys for WX and H5, and Alipay keys for ZFB. The plugin preserves these fields in the Page runtime capsule
     * and `<path>.json`, adding generated native-component registrations separately. It does not translate configuration names
     * between platforms.
     */
    config?: VptPageConfig
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
     * Native application configuration for the selected target.
     *
     * Use Taro/WeChat keys for WX and H5, and Alipay keys for ZFB. The plugin otherwise preserves the supplied configuration for
     * runtime specialization and `app.json`; it does not translate configuration names between platforms. The plugin always
     * derives `pages` from {@link pages}; caller-provided `pages`, `subPackages`, and `subpackages` values are discarded because
     * the build pipeline owns page order and generated package placement.
     */
    appJson: VptAppConfig

    /**
     * Native development-tool project configuration written without merging.
     *
     * WX emits this object as `project.config.json`; ZFB emits it as `mini.project.json`; H5 ignores it. Supply the schema
     * expected by the selected target rather than sharing one project's platform-specific values across invocations. ZFB must
     * use format 2 with `compileOptions.globalObjectMode: 'enable'` because the upstream Taro runtime reads the platform `global`;
     * its Taro-style ES6 output also relies on `compileOptions.transpile` for the developer tool's final syntax conversion.
     */
    projectConfigJson: VptJsonObject

    /**
     * Local development-tool preferences written without merging.
     *
     * WX emits this object as `project.private.config.json`; ZFB emits it as `.mini-ide/project-ide.json`; H5 ignores it.
     * These files control local IDE behavior rather than portable application metadata. In particular, the ZFB file does not
     * associate the project with an Alipay App ID; Alipay Mini Program Studio keeps that selection in its workspace storage.
     */
    projectPrivateConfigJson?: VptJsonObject

    /**
     * WeChat Mini Program indexing rules written to `sitemap.json` without merging.
     *
     * The file is emitted only when this value is provided for a `wx` build. It is ignored for ZFB and H5.
     */
    sitemapJson?: VptJsonObject

    /**
     * Selects the Mini Program development update mode. Omission uses `devtools`.
     *
     * This option affects only `vite serve` for `wx` and `zfb` targets and never changes H5 or production output.
     */
    hmr?: VptHmrOptions
}
