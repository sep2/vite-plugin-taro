import path from 'node:path'
import type { OutputOptions, RolldownOptions } from 'rolldown'
import { build } from 'rolldown'
import { type DevEngine, viteReporterPlugin } from 'rolldown/experimental'
import type { ViteDevServer } from 'vite'
import { memoize } from '../../../utils/memoize.ts'
import type { MiniContract } from '../mini-contract.ts'
import type { MiniHmrMode } from './hmr-mode.ts'
import { replaceViteTransformPlugin } from './replace-vite-transform-plugin.ts'

export type BundledDev = {
    _devEngine?: DevEngine
    getRolldownOptions(): Promise<RolldownOptions>
    listen(): Promise<void>
    triggerBundleRegenerationIfStale(): Promise<boolean>
}

/**
 * Installs physical Mini Program output and runtime conventions over Vite's browser-oriented bundled-development options.
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
    contract: Pick<MiniContract, 'options'>
    hmrMode: MiniHmrMode
}): void {
    /*
     * Vite owns this mutable adapter method and calls it later when constructing DevEngine. Replacing that one seam preserves
     * Vite's resolved graph while applying native physical-output conventions to every options generation. Capturing and mutating one
     * options object here would be stale on later complete builds; creating a second engine would duplicate watchers and graphs.
     * The bound original remains immutable and is invoked exactly once per delegated options request.
     */
    const original = bundledDev.getRolldownOptions.bind(bundledDev)

    bundledDev.getRolldownOptions = async () => {
        const rolldownOptions = await original()
        const output = ensureSingleOutput(rolldownOptions)

        const configuredOutput = server.config.build.rolldownOptions.output
        if (Array.isArray(configuredOutput)) {
            throw new Error('Mini Program development supports one configured Rolldown output.')
        }
        const configured = configuredOutput ?? {}

        // Entry banners run after Rolldown has assigned chunk names, so the mode receives route membership rather than source
        // IDs. DevTools uses O(1) membership to add Page patch dependencies, interpreter initializes only App, and rebuild emits
        // no host-only edge. ReadonlySet prevents the entry set from changing while Rolldown invokes later banners.
        const pageFiles: ReadonlySet<string> = new Set(contract.options.pages.map((page) => `${page.path}.js`))

        /*
         * Rolldown passes this mutable output object onward by identity, and nested Vite plugins may already retain it. Mutating
         * that single object preserves their references while applying the shared output configuration and native runtime format.
         * Naming is inherited unchanged; mutating configuredOutput itself would leak development-only fields into Vite config.
         */
        Object.assign(output, configured, {
            // These banners create physical CommonJS edges only after graph analysis. Patch modes initialize their App runtime;
            // DevTools additionally prepends Page delivery edges, while rebuild needs neither. Host-only metadata stays outside
            // the application chunk graph and therefore cannot affect placement or generate transport chunks of its own.
            banner: hmrMode.createEntryBanner(pageFiles),
            // Keep ESM until the shared Mini renderChunk pipeline classifies each final chunk and converts capsules to
            // System.register data or native/amphibious entries to CommonJS. Choosing CommonJS here would erase that boundary.
            format: 'es',
            // Bundled development emits complete physical output repeatedly. Minifying bounds disk transfer and native-tool
            // compile work; source-level HMR diagnostics still come from Vite/Rolldown before this final output pass.
            minify: true,
            // Fast Refresh recognizes HOC-returned components by their function names; minification must not erase that boundary.
            keepNames: true,
            // Native tools execute physical project files and HMR applies module factories rather than browser source maps. Disabling
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
            // Retain configured devMode fields while the three explicit Mini invariants below win.
            ...(typeof existingDevMode === 'object' ? existingDevMode : {}),
            // Bundle the selected adapter and pass the shared provider into its lexical globalThis wrapper at startup.
            // This needs neither the application's virtual binding nor its HMR registry. Patch adapters initialize delivery
            // and reports; rebuild omits delivery edges.
            implement: await bundleRuntimeSource(hmrMode.runtimeFile),
            // Produce a complete output graph on the initial build. Lazy per-request compilation cannot establish the closed
            // App/Page graph, native companions, style sidecars, and build identity required before any patch is admitted.
            lazy: false,
            // The adapter imports and bundles Rolldown's exported DevRuntime, including its module registry and helpers.
            // Disable the deprecated automatic injection so there is only one base runtime implementation.
            skipCommonRuntimeInjection: true
        }

        /*
         * The plugin list is mutable configuration consumed once by this engine generation. Replace the top-level reference with
         * an ordered composite rather than pushing into Vite's potentially shared nested array; the reporter observes final output
         * without mutating Vite's retained input list.
         */
        rolldownOptions.plugins = [
            await replaceViteTransformPlugin(rolldownOptions.plugins, server.environments.client.config),
            createViteReporter(server)
        ]

        return rolldownOptions
    }
}

/** Returns the configured output after rejecting states unsupported by the physical Mini Program engine. */
export function requireSingleOutput(rolldownOptions: RolldownOptions): OutputOptions {
    if (!rolldownOptions.output || Array.isArray(rolldownOptions.output)) {
        throw new Error('Mini Program development requires exactly one Rolldown output.')
    }

    return rolldownOptions.output
}

/** Creates the one missing output object while rejecting a configured output array. */
function ensureSingleOutput(rolldownOptions: RolldownOptions): OutputOptions {
    if (Array.isArray(rolldownOptions.output)) {
        throw new Error('Mini Program development requires one configured Rolldown output.')
    }
    // Rolldown needs the created object attached to input options by identity; returning a detached fallback would be ignored.
    rolldownOptions.output ??= {}
    return rolldownOptions.output
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
 * memoize owns one mutable Promise per runtime entry. getRolldownOptions may run for multiple complete generations, and separate
 * Vite servers may select different targets or modes in one process. Sharing each in-flight/result Promise prevents duplicate
 * nested builds without leaking mutable Rolldown output objects between engines.
 */
const bundleRuntimeSource = memoize(async function bundleRuntimeSource(runtimeFile: string): Promise<string> {
    // Keep this build ordinary: a lexical parameter below supplies the shared global to every bundled runtime module.
    const result = await build({
        input: runtimeFile,
        output: {
            format: 'iife',
            // The combined physical runtime owns final minification, so minifying this embedded source would duplicate work.
            minify: false,
            sourcemap: false
        },
        // write: false keeps this nested helper build from creating a second dist directory in the application project.
        write: false
    })

    // The lexical global prevents self-injection. Assign the completed instance to the chunk-local cell added at render time,
    // before Rolldown's graph prelude and any co-located modules use it. No host-global runtime binding is required.
    return `__rolldown_runtime__ = (function (globalThis) {\n${result.output[0].code}\nreturn globalThis.__rolldown_runtime__;\n})(__VPT_GLOBAL__);`
})
