import path from 'node:path'
import type { InputOptions, OutputOptions, Plugin } from 'rolldown'
import { build } from 'rolldown'
import { type DevEngine, viteReporterPlugin } from 'rolldown/experimental'
import type { ViteDevServer } from 'vite'
import type { VptOptions } from '../../../../options.ts'
import { once } from '../../../utils/once.ts'
import { resolvePackageFile } from '../../../utils/packages.ts'
import { appShellFileName } from '../module/module.ts'

type BundledDevRolldownOptions = InputOptions & {
    experimental?: {
        [key: string]: unknown
        devMode?: boolean | Record<string, unknown>
    }
    output?: OutputOptions | OutputOptions[]
}

export type BundledDev = {
    _devEngine?: DevEngine
    getRolldownOptions(): Promise<BundledDevRolldownOptions>
    listen(): Promise<void>
    triggerBundleRegenerationIfStale(): Promise<boolean>
}

/**
 * Installs physical WX output and runtime conventions over Vite's browser-oriented bundled-development options.
 * Build completion deliberately remains outside this options adapter: DevEngine onOutput is the single lifecycle authority.
 */
export function installWxDevOptions({
    bundledDev,
    server,
    options,
    hostPlugins
}: {
    bundledDev: BundledDev
    server: ViteDevServer
    options: VptOptions
    hostPlugins: Plugin[]
}): void {
    /*
     * Vite owns this mutable adapter method and calls it later when constructing DevEngine. Replacing that one seam preserves
     * Vite's resolved graph while applying WX physical-output conventions to every options generation. Capturing and mutating one
     * options object here would be stale on later complete builds; creating a second engine would duplicate watchers and graphs.
     * The bound original remains immutable and is invoked exactly once per delegated options request.
     */
    const original = bundledDev.getRolldownOptions.bind(bundledDev)

    bundledDev.getRolldownOptions = async () => {
        const rolldownOptions = await original()
        const output = ensureSingleOutput(rolldownOptions)

        const configuredOutput = server.config.build.rolldownOptions.output
        if (Array.isArray(configuredOutput)) {
            throw new Error('wx development supports one configured Rolldown output.')
        }
        const configured = configuredOutput ?? {}

        // Every page entry must depend on hmr/patches.js: DevTools classifies a changed Page dependency as Page JavaScript
        // hot reload and re-executes live Pages, which is the only physical patch trigger that preserves the App heap. Although
        // Set provides O(1) membership, exposing it as ReadonlySet prevents mutation after this options generation is resolved.
        const pageFiles: ReadonlySet<string> = new Set(options.pages.map((page) => `${page.path}.js`))

        /*
         * Rolldown passes this mutable output object onward by identity, and nested Vite plugins may already retain it. Mutating
         * that single object preserves their references while atomically replacing browser-oriented naming and format fields with
         * stable physical WX conventions. Cloning only our fields would leave retained references on stale hashed filenames;
         * mutating configuredOutput itself would leak development normalization back into the user's resolved Vite config.
         */
        Object.assign(output, configured, {
            // Development output is overwritten in place after every complete build. Strip hash placeholders from the
            // configured asset pattern so old files cannot accumulate and native JSON/WXML references remain stable.
            assetFileNames: createStableFileNames(configured.assetFileNames, 'assets/[name][extname]'),
            // Banners create physical CommonJS edges after graph analysis: App initializes the dev runtime and each Page
            // consumes the stable patch journal without allowing those host-only files into the application chunk graph.
            banner: createEntryBanner(pageFiles),
            // Preserve the configured directory/name shape while removing content hashes. Stable chunk paths let DevTools
            // overwrite executable files and let cumulative HMR patches address one persistent physical module identity.
            chunkFileNames: createStableFileNames(configured.chunkFileNames, 'assets/[name].js'),
            // Native entry paths are public Mini Program routes (`app.js`, `pages/.../index.js`); development must never hash
            // or relocate them because DevTools determines App/Page reload behavior from those exact filenames.
            entryFileNames: createStableFileNames(configured.entryFileNames, '[name]'),
            // Keep ESM until the existing WX renderChunk pipeline classifies each final chunk and converts capsules to
            // System.register data or native/amphibious entries to CommonJS. Choosing CommonJS here would erase that boundary.
            format: 'es',
            // Bundled development emits complete physical output repeatedly. Minifying bounds disk transfer and DevTools
            // compile work; source-level HMR diagnostics still come from Vite/Rolldown before this final output pass.
            minify: true,
            // DevTools executes physical WX files and HMR applies module factories rather than browser source maps. Disabling
            // maps avoids extra output files and prevents Vite's Oxc sourcemap transform from touching generated host code.
            sourcemap: false
        })

        /*
         * experimental belongs to this transaction-local Rolldown options generation. Materialize it only when absent, then
         * replace devMode with a new object so user fields survive without mutating a possibly shared configured sub-object.
         */
        rolldownOptions.experimental ??= {}
        const existingDevMode = rolldownOptions.experimental.devMode
        rolldownOptions.experimental.devMode = {
            // Retain unknown user/forward-compatible devMode fields while the three explicit WX invariants below win.
            ...(typeof existingDevMode === 'object' ? existingDevMode : {}),
            // Install the WX-adapted self-contained Rolldown runtime. It consumes physical patch journals and reports
            // acknowledgements/rebuild requests through the host bridge instead of relying on browser globals or sockets.
            implement: await bundleRuntimeSource(),
            // Produce a complete output graph on the initial build. Lazy per-request compilation cannot establish the closed
            // App/Page graph, native companions, style sidecars, and build identity required before any patch is admitted.
            lazy: false,
            // Keep Rolldown's common runtime injection because generated application factories call its module registry and
            // HMR primitives. Skipping it would leave the custom implementation without the runtime surface it extends.
            skipCommonRuntimeInjection: false
        }

        /*
         * The plugin list is mutable configuration consumed once by this engine generation. Replace the top-level reference with
         * an ordered composite rather than pushing into Vite's potentially shared nested array: existing transforms run first,
         * host capture observes their final values, and the reporter observes final output without mutating either input list.
         */
        rolldownOptions.plugins = [rolldownOptions.plugins, hostPlugins, createViteReporter(server)]
        disableViteOxcSourcemap(rolldownOptions.plugins)

        return rolldownOptions
    }
}

/** Returns the configured output after rejecting states unsupported by the physical WX engine. */
export function requireSingleOutput(rolldownOptions: BundledDevRolldownOptions): OutputOptions {
    if (!rolldownOptions.output || Array.isArray(rolldownOptions.output)) {
        throw new Error('wx development requires exactly one Rolldown output.')
    }

    return rolldownOptions.output
}

/** Creates the one missing output object while rejecting a configured output array. */
function ensureSingleOutput(rolldownOptions: BundledDevRolldownOptions): OutputOptions {
    if (Array.isArray(rolldownOptions.output)) {
        throw new Error('wx development requires one configured Rolldown output.')
    }
    // Rolldown needs the created object attached to input options by identity; returning a detached fallback would be ignored.
    rolldownOptions.output ??= {}
    return rolldownOptions.output
}

/**
 * Prepends entry banners after Rolldown's analysis so their native requires remain physical dependencies rather than chunk
 * graph edges. The App initializes the runtime identity, while every Page explicitly applies the watched patch data before its
 * capsule import continues.
 */
function createEntryBanner(pageFiles: ReadonlySet<string>): (chunk: { name: string; fileName: string }) => string {
    return (chunk) => {
        if (chunk.name === appShellFileName) {
            return "__rolldown_runtime__.initialize(require('./hmr/info.js'));\n"
        }
        if (pageFiles.has(chunk.name)) {
            const patchesPath = path.posix.relative(path.posix.dirname(chunk.fileName), 'hmr/patches.js')
            const route = chunk.name.slice(0, -'.js'.length)
            return `__rolldown_runtime__.applyPatches(require('${patchesPath}'), ${JSON.stringify(route)});\n`
        }
        return ''
    }
}

function createStableFileNames<Value>(addon: unknown, fallback: string): string | ((value: Value) => string) {
    if (typeof addon === 'function') {
        return (value) => toStableFileName(String(addon(value)))
    }
    return toStableFileName(typeof addon === 'string' ? addon : fallback)
}

function toStableFileName(fileName: string): string {
    return fileName
        .replace(/(^|\/)\[hash(?::\d+)?\](?=\.|$)/g, '$1[name]')
        .replace(/[-_.]\[hash(?::\d+)?\]/g, '')
        .replace(/\[hash(?::\d+)?\]/g, '[name]')
}

type ViteTransformPlugin = {
    _options?: { transformOptions?: { sourcemap?: boolean } }
    name?: string
}

function disableViteOxcSourcemap(pluginOption: unknown): void {
    if (Array.isArray(pluginOption)) {
        pluginOption.forEach(disableViteOxcSourcemap)
        return
    }
    if (!pluginOption || typeof pluginOption !== 'object') return

    const plugin = pluginOption as ViteTransformPlugin
    if (plugin.name === 'builtin:vite-transform' && plugin._options?.transformOptions) {
        /*
         * Vite's private builtin retains this mutable transform options object and does not expose a public replacement hook.
         * Updating its one sourcemap flag prevents Oxc from allocating maps that final WX output always discards; cloning the
         * descriptor would not update the builtin closure that reads the original object during transforms.
         */
        plugin._options.transformOptions.sourcemap = false
    }
}

function createViteReporter(server: ViteDevServer) {
    const { build, logger, root } = server.config
    return viteReporterPlugin({
        assetsDir: path.join(build.assetsDir, '/'),
        chunkLimit: 2000,
        isLib: Boolean(build.lib),
        isTty: Boolean(process.stdout.isTTY && !process.env.CI),
        logInfo: (message) => logger.info(message),
        reportCompressedSize: false,
        root,
        warnLargeChunks: false
    })
}

/*
 * once owns a mutable cached Promise, justified because getRolldownOptions may run for multiple complete generations while the
 * runtime input and build options remain immutable for the process lifetime. Sharing the in-flight/result Promise prevents
 * concurrent options requests from launching duplicate nested builds; caching source instead of a Rolldown output object avoids
 * leaking mutable bundle metadata between engines.
 */
const bundleRuntimeSource = once(async function bundleRuntimeSource(): Promise<string> {
    // write: false keeps this nested helper build from creating a second dist directory in the application project.
    const result = await build({
        input: resolvePackageFile('dist/runtime/wx/dev/dev-runtime.js'),
        output: { format: 'iife', minify: true, sourcemap: false },
        write: false
    })
    return result.output[0].code
})
