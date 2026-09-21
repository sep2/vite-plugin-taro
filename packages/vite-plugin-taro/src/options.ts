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
export type VptTarget = 'wx' | 'zfb' | 'tt' | 'h5'

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
     * Use WeChat keys for WX, Alipay keys for ZFB, TikTok keys for TT, and Taro/WeChat keys for H5. The plugin preserves these
     * fields in the Page runtime capsule and `<path>.json`, adding generated native-component registrations separately.
     * It does not translate configuration names between platforms.
     */
    config?: VptPageConfig
}

/** Configures vpt for one build target. */
export interface VptOptions {
    /**
     * Platform produced by the current Vite invocation.
     *
     * Use `wx` for WeChat, `zfb` for Alipay, `tt` for TikTok Mini Programs, or `h5` for a browser application.
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
     * Use WeChat keys for WX, Alipay keys for ZFB, TikTok keys for TT, and Taro/WeChat keys for H5. The plugin preserves the supplied
     * configuration for runtime specialization and `app.json`; it does not translate configuration names between platforms. The plugin always
     * derives `pages` from {@link pages}; caller-provided `pages`, `subPackages`, and `subpackages` values are discarded because
     * the build pipeline owns page order and generated package placement.
     */
    appJson: VptAppConfig

    /**
     * Native development-tool project configuration. Mini Program watch builds disable native hot reload in output:
     * WX forces `setting.compileHotReLoad: false`; ZFB forces `developOptions.hotReload: false`; TT forces top-level
     * `compileHotReload: false` and `setting.compileHotReLoad: false`, preserving `setting.autoCompile`.
     * Other builds write it without merging.
     *
     * WX emits `project.config.json`; ZFB emits `mini.project.json`; TT emits `project.config.json`; H5 ignores it. Supply the schema
     * expected by the selected target rather than sharing one project's platform-specific values across invocations. ZFB must
     * use format 2 with `compileOptions.globalObjectMode: 'enable'` because the upstream Taro runtime reads the platform `global`;
     * its Taro-style ES6 output also relies on `compileOptions.transpile` for the developer tool's final syntax conversion.
     */
    projectConfigJson: VptJsonObject

    /**
     * Local development-tool preferences. WX and TT watch builds force `setting.compileHotReLoad: false` in emitted
     * preferences; ZFB preferences and other builds are written without merging.
     *
     * WX emits `project.private.config.json`; ZFB emits `.mini-ide/project-ide.json`; TT emits `project.private.config.json`;
     * H5 ignores it. TT private configuration requires TikTok DevTools 4.0.7+ and supports only its documented fields.
     * These files control local IDE behavior rather than portable application metadata. In particular, the ZFB file does not
     * associate the project with an Alipay App ID; Alipay Mini Program Studio keeps that selection in its workspace storage.
     */
    projectPrivateConfigJson?: VptJsonObject

    /**
     * WeChat Mini Program indexing rules written to `sitemap.json` without merging.
     *
     * The file is emitted only when this value is provided for a `wx` build. It is ignored for ZFB, TT, and H5.
     */
    sitemapJson?: VptJsonObject

    /**
     * Add JavaScript and Web APIs that your mini app needs but its host may not provide.
     *
     * Use core-js module names without the `core-js/modules/` prefix or `.js` suffix; no separate core-js installation is needed.
     * For example, `web.url` provides `URL` and `URLSearchParams`, while `es.array.at` provides `Array.prototype.at`.
     * On WX, use `globalThis.URL` or add `define: { URL: 'globalThis.URL' }` to your Vite config for bare `URL` references.
     *
     * Selected polyfills run before your app in development and production, updating global APIs and prototypes when needed.
     * Omit this option or use `[]` to add no optional polyfills. H5 ignores this option.
     *
     * @example
     * polyfills: ['web.url', 'es.array.at']
     */
    polyfills?: readonly string[]

    /**
     * Selects the Mini Program development update mode. Omission uses `devtools`.
     *
     * This option affects only `vite serve` for `wx`, `zfb`, and `tt` targets and never changes H5 or production output.
     * Prefer `interpreter` on TT; native DevTools patch execution has not been verified in TikTok DevTools.
     */
    hmr?: VptHmrOptions
}
