import path from 'node:path'
import type { InputOptions, OutputOptions } from 'rolldown'
import { build } from 'rolldown'
import { type DevEngine, viteReporterPlugin } from 'rolldown/experimental'
import type { ViteDevServer } from 'vite'
import { memoize } from '../../../utils/memoize.ts'
import type { MiniContract } from '../mini-contract.ts'
import type { MiniHmrMode } from './hmr-mode.ts'

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
export function installMiniDevOptions({
    bundledDev,
    server,
    contract,
    hmrMode
}: {
    bundledDev: BundledDev
    server: ViteDevServer
    contract: MiniContract
    hmrMode: MiniHmrMode
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

        // Entry banners run after Rolldown has assigned chunk names, so the mode receives route membership rather than source
        // IDs. DevTools mode uses O(1) membership to add Page patch dependencies; interpreter mode emits only its App initializer.
        // ReadonlySet prevents the resolved entry set from changing while Rolldown invokes the banner for later chunks.
        const pageFiles: ReadonlySet<string> = new Set(contract.options.pages.map((page) => `${page.path}.js`))

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
            // These banners create physical CommonJS edges only after graph analysis. Every mode initializes its App runtime;
            // modes that need Page delivery can additionally prepend Page edges. Host-only metadata stays outside the application
            // chunk graph and therefore cannot affect placement or generate transport chunks of its own.
            banner: hmrMode.createEntryBanner(pageFiles),
            // Preserve the configured directory/name shape while removing content hashes. Stable chunk paths let DevTools
            // overwrite executable files and keep one persistent physical module identity across complete builds.
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
            // Install the self-contained runtime selected once by the HMR mode. Nested bundling resolves all adapter imports into
            // one implementation string because Rolldown injects it into a generated runtime chunk where ordinary module imports
            // are unavailable. Shared ACK/rebuild reports use the host bridge; each adapter separately owns how executable module
            // registrations reach that runtime.
            implement: await bundleRuntimeSource(hmrMode.runtimeFile),
            // Produce a complete output graph on the initial build. Lazy per-request compilation cannot establish the closed
            // App/Page graph, native companions, style sidecars, and build identity required before any patch is admitted.
            lazy: false,
            // Keep Rolldown's common runtime injection because generated application factories call its module registry and
            // HMR primitives. Skipping it would leave the custom implementation without the runtime surface it extends.
            skipCommonRuntimeInjection: false
        }

        /*
         * The plugin list is mutable configuration consumed once by this engine generation. Replace the top-level reference with
         * an ordered composite rather than pushing into Vite's potentially shared nested array; the reporter observes final output
         * without mutating Vite's retained input list.
         */
        rolldownOptions.plugins = [rolldownOptions.plugins, createViteReporter(server)]
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
 * memoize owns one mutable Promise per runtime path. getRolldownOptions may run for multiple complete generations, and separate
 * Vite servers may select different mode entries in one process. Sharing each in-flight/result Promise prevents duplicate nested
 * builds without leaking mutable Rolldown output objects between engines.
 */
const bundleRuntimeSource = memoize(async function bundleRuntimeSource(runtimeFile: string): Promise<string> {
    // write: false keeps this nested helper build from creating a second dist directory in the application project.
    const result = await build({
        input: runtimeFile,
        output: { format: 'iife', minify: true, sourcemap: false },
        write: false
    })
    return result.output[0].code
})
