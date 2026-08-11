import path from 'node:path'
import type { InputOptions, OutputOptions, Plugin } from 'rolldown'
import { build } from 'rolldown'
import { type DevEngine, viteReporterPlugin } from 'rolldown/experimental'
import type { ViteDevServer } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { once } from '../../../utils/once.ts'
import { resolvePackageFile } from '../../../utils/packages.ts'
import { appShellFileName } from '../module.ts'

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

/** Installs the physical WX output and runtime conventions over Vite's browser-oriented bundled-development options. */
export function installWxDevOptions({
    bundledDev,
    server,
    options,
    hostPlugins
}: {
    bundledDev: BundledDev
    server: ViteDevServer
    options: VitePluginTaroOptions
    hostPlugins: Plugin[]
}): Promise<void> {
    // The buildEnd hook and its one-shot result belong to the same abstraction. Consumers can await startup without receiving
    // a resolver capable of settling it externally.
    const initialBuild = Promise.withResolvers<void>()
    const settleInitialBuild = once((error: Error | undefined): void => {
        if (error) {
            initialBuild.reject(error)
        } else {
            initialBuild.resolve()
        }
    })
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
        // hot reload and re-executes live Pages, which is the only physical patch trigger that preserves the App heap.
        const pageFiles = new Set(options.pages.map((page) => `${page.path}.js`))

        Object.assign(output, configured, {
            assetFileNames: createStableFileNames(configured.assetFileNames, 'assets/[name][extname]'),
            banner: createEntryBanner(pageFiles),
            chunkFileNames: createStableFileNames(configured.chunkFileNames, 'assets/[name].js'),
            entryFileNames: createStableFileNames(configured.entryFileNames, '[name]'),
            format: 'es',
            minify: true,
            sourcemap: false
        })

        rolldownOptions.experimental ??= {}
        const existingDevMode = rolldownOptions.experimental.devMode
        rolldownOptions.experimental.devMode = {
            ...(typeof existingDevMode === 'object' ? existingDevMode : {}),
            implement: await bundleRuntimeSource(),
            lazy: false,
            skipCommonRuntimeInjection: false
        }

        const reportInitialBuildPlugin: Plugin = {
            name: 'vpt:wx-report-initial-build',
            buildEnd: settleInitialBuild
        }

        // Preserve the physical paths watched by WeChat DevTools across host restarts; the complete build overwrites every
        // active output without disrupting the hot-reload watcher.
        rolldownOptions.plugins = [
            rolldownOptions.plugins,
            hostPlugins,
            reportInitialBuildPlugin,
            createViteReporter(server)
        ]
        disableViteOxcSourcemap(rolldownOptions.plugins)

        return rolldownOptions
    }

    return initialBuild.promise
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

// The runtime source is immutable for the host's lifetime, so the nested bundle is shared by every complete build.
const bundleRuntimeSource = once(async function bundleRuntimeSource(): Promise<string> {
    // write: false keeps this nested helper build from creating a second dist directory in the application project.
    const result = await build({
        input: resolvePackageFile('dist/runtime/wx/dev/dev-runtime.js'),
        output: { format: 'iife', minify: true, sourcemap: false },
        write: false
    })
    return result.output[0].code
})
