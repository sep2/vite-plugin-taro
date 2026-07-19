import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { InputOptions, OutputOptions } from 'rolldown'
import { type DevEngine, dev, viteReporterPlugin } from 'rolldown/experimental'
import type { ViteDevServer } from 'vite'
import { resolvePackageFile } from '../../../utils/packages.ts'
import { hmrInfoFileName } from './legacy-hmr-info.ts'
import { hmrUpdateFileName } from './legacy-hmr-update.ts'

type BundledDevRolldownOptions = InputOptions & {
    output?: OutputOptions | OutputOptions[]
    experimental?: {
        devMode?: boolean | Record<string, unknown>
        [key: string]: unknown
    }
}

/** The deliberately small Vite 8.1 private surface used by the wx adapter. */
type LegacyBundledDev = {
    // Vite's close lifecycle reads this field, so the owned engine must be published back to the original instance.
    _devEngine?: DevEngine
    // This is still the authoritative way to obtain Vite's fully resolved plugin and optimizer configuration.
    getRolldownOptions(): Promise<BundledDevRolldownOptions>
    // Replaced before Vite starts the environment so Vite cannot create its own skip-write DevEngine.
    listen(): Promise<void>
    // Replaced because Vite's HTML middleware otherwise turns stale HMR output into an implicit physical rebuild.
    triggerBundleRegenerationIfStale(): Promise<boolean>
}

type OutputAddon = string | ((chunk: { fileName: string }) => string | Promise<string>)

/** The narrow DevEngine capability DevHost needs for its HMR HTTP endpoint. */
export type BundledDevSession = Readonly<{
    registerModules(clientId: string, modules: string[]): Promise<boolean>
}>

/**
 * Installs the wx-specific replacement for Vite's bundled-development adapter and returns its HMR capability.
 *
 * Vite still owns the adapter lifecycle and closes the published DevEngine. DevHost invokes this setup after physical
 * output preparation and owns the surrounding project lifecycle; this module contains every Vite-private/Rolldown detail.
 */
export function createBundledDevSession({
    server,
    pageFiles,
    reportError
}: {
    server: ViteDevServer
    pageFiles: ReadonlySet<string>
    reportError(operation: string, error: unknown): void
}): BundledDevSession {
    const bundledDev = getBundledDev(server)

    installRolldownOptions()
    installDevEngine()

    return {
        async registerModules(clientId, modules): Promise<boolean> {
            const engine = bundledDev._devEngine
            if (!engine) {
                return false
            }

            await engine.registerModules(clientId, modules)
            return true
        }
    }

    /** Restores wx output semantics that Vite's bundled-development resolver replaces with browser defaults. */
    function installRolldownOptions(): void {
        const getRolldownOptions = bundledDev.getRolldownOptions.bind(bundledDev)
        const devRuntimePath = resolvePackageFile('dist/runtime/wx/dev/dev-runtime.js')
        const devRuntimeSource = readFileSync(devRuntimePath, 'utf8')

        bundledDev.getRolldownOptions = async () => {
            const rolldownOptions = await getRolldownOptions()
            if (Array.isArray(rolldownOptions.output)) {
                throw new Error('wx development supports one Rolldown output.')
            }

            rolldownOptions.output ??= {}
            const output = rolldownOptions.output
            const configuredOutput = server.config.build.rolldownOptions.output
            if (Array.isArray(configuredOutput)) {
                throw new Error('wx development supports one configured output.')
            }

            const configured = (configuredOutput ?? {}) as Record<string, unknown>
            const configuredBanner = configured.banner as OutputAddon | undefined

            // Apply the complete configured output first so placement groups, preserveEntrySignatures, user ordering, and
            // any future wx output option survive. Only development-specific rendering and filenames are overridden.
            Object.assign(output, configured, {
                format: 'es',
                minify: true,
                sourcemap: false,
                entryFileNames: createStableFileNames(configured.entryFileNames, '[name]'),
                chunkFileNames: createStableFileNames(configured.chunkFileNames, 'assets/[name].js'),
                assetFileNames: createStableFileNames(configured.assetFileNames, 'assets/[name][extname]'),
                banner: createDevelopmentBanner(configuredBanner, pageFiles)
            })

            // Lazy compilation expects browser HTTP delivery. Disable it so SystemJS can load every discoverable physical
            // capsule through literal require()/require.async() paths from the initial Mini Program output.
            rolldownOptions.experimental ??= {}
            rolldownOptions.experimental.devMode = {
                ...(typeof rolldownOptions.experimental.devMode === 'object'
                    ? rolldownOptions.experimental.devMode
                    : {}),
                lazy: false,
                // Rolldown appends this compiled host directly after its generated DevRuntime base class. Reading the
                // normal package build output keeps TypeScript and runtime compilation outside the instrumented graph.
                implement: devRuntimeSource
            }

            // Vite installs its native reporter only for the build command. Bundled serve uses the same Rolldown output
            // lifecycle but omits that plugin, so append it to retain normal transform, render, and generated-file output
            // in the terminal while Rolldown writes the physical Mini Program.
            rolldownOptions.plugins = [rolldownOptions.plugins, createViteReporter(server)]
            disableViteOxcSourcemap(rolldownOptions.plugins)
            return rolldownOptions
        }
    }

    /** Creates the one DevEngine that writes the initial project and computes patch-only later HMR changes. */
    function installDevEngine(): void {
        // Vite's bundled HTML middleware calls this method when its memory bundle is stale. Its default implementation
        // invokes ensureLatestBuildOutput(), which would enter Rolldown's write path merely because a browser loaded `/`.
        // The wx application is consumed from the physical directory, so HTTP access must never control its revision.
        bundledDev.triggerBundleRegenerationIfStale = async () => false

        bundledDev.listen = async () => {
            const rolldownOptions = await bundledDev.getRolldownOptions()
            const outputOptions = rolldownOptions.output
            if (!outputOptions || Array.isArray(outputOptions)) {
                throw new Error('wx development requires one Rolldown output.')
            }

            // ensureCurrentBuildFinish() can resolve before the JavaScript onOutput callback has run. Use the callback as
            // the startup barrier because incremental_write() has completed its physical writes before invoking it.
            const initialOutput = Promise.withResolvers<void>()

            const engine = await dev(rolldownOptions, outputOptions, {
                // Ordinary watcher changes become Hmr tasks, not HmrRebuild tasks. Consequently they compute patches but
                // never enter incremental_write(). Recovery/full-build operations remain able to write intentionally.
                rebuildStrategy: 'never',
                // DevHost already registers runtime modules through its HTTP endpoint. Successful patches intentionally
                // remain in this callback boundary until DevHost publishes their client-specific code to hmr/update.js.
                onHmrUpdates: (result) => {
                    if (result instanceof Error) {
                        reportError('HMR generation', result)
                    }
                },
                onOutput: (result) => {
                    if (result instanceof Error) {
                        reportError('build', result)
                        initialOutput.reject(result)
                    } else {
                        initialOutput.resolve()
                    }
                },
                watch: {
                    // This flag is fixed when the native engine is created. False makes the initial FullBuild use
                    // incremental_write(); it does not write patch-only Hmr tasks selected by rebuildStrategy above.
                    skipWrite: false
                }
            })

            // Publish the engine before run() so Vite's close lifecycle and future private callers see the same instance.
            bundledDev._devEngine = engine

            void engine.run().catch((error: unknown) => {
                reportError('DevEngine', error)
                initialOutput.reject(error)
            })

            await initialOutput.promise
        }
    }
}

// Rolldown's generated development modules reference this lexical binding. Native and SystemJS-rendered chunks cannot
// import a browser HMR client, so every physical development chunk binds it to the one runtime installed on `global`.
const rolldownRuntimeBinding = 'const __rolldown_runtime__ = global.__rolldown_runtime__;'

/** Composes user banners with the wx runtime binding and native development dependencies. */
function createDevelopmentBanner(
    configuredBanner: OutputAddon | undefined,
    pageFiles: ReadonlySet<string>
): (chunk: { fileName: string }) => Promise<string> {
    return async (chunk) => {
        const configured =
            typeof configuredBanner === 'function' ? await configuredBanner(chunk) : (configuredBanner ?? '')
        const hmrRequires = createHmrRequires(chunk.fileName, pageFiles)
        return [configured, rolldownRuntimeBinding, hmrRequires].filter(Boolean).join('\n')
    }
}

/** Adds literal native dependencies whose paths are valid from the final physical entry location. */
function createHmrRequires(fileName: string, pageFiles: ReadonlySet<string>): string {
    // App synchronously configures the already-installed runtime before application capsules can execute.
    if (fileName === 'app.js') {
        return `__rolldown_runtime__.setHmrInfo(require(${JSON.stringify(`./${hmrInfoFileName}`)}));`
    }

    if (pageFiles.has(fileName)) {
        // Page entries can be nested at arbitrary route depths. Derive the literal root-relative require from the rendered
        // filename instead of assuming the conventional `pages/<route>/index.js` depth.
        const root = '../'.repeat(fileName.split('/').length - 1)
        return `require(${JSON.stringify(`${root}${hmrUpdateFileName}`)});`
    }

    return ''
}

/** Preserves configured naming functions while removing content hashes from their development results. */
function createStableFileNames<T>(addon: unknown, fallback: string): string | ((value: T) => string) {
    if (typeof addon === 'function') {
        return (value) => toStableFileName(String(addon(value)))
    }
    return toStableFileName(typeof addon === 'string' ? addon : fallback)
}

/** Removes standalone and delimiter-prefixed hash placeholders without disturbing directories or extensions. */
function toStableFileName(fileName: string): string {
    return fileName
        .replace(/(^|\/)\[hash(?::\d+)?\](?=\.|$)/g, '$1[name]')
        .replace(/[-_.]\[hash(?::\d+)?\]/g, '')
        .replace(/\[hash(?::\d+)?\]/g, '[name]')
}

// Vite forces its bundled-serve Oxc transform to generate maps even when final output maps are disabled. Its native
// BuiltinPlugin keeps the constructor options on this private field until Rolldown consumes them. Disable that wasted
// work while this adapter is already traversing the same resolved plugin list to replace Vite's DevEngine startup.
type ViteTransformPlugin = {
    name?: string
    _options?: {
        transformOptions?: {
            sourcemap?: boolean
        }
    }
}

function disableViteOxcSourcemap(pluginOption: unknown): void {
    if (Array.isArray(pluginOption)) {
        for (const plugin of pluginOption) {
            disableViteOxcSourcemap(plugin)
        }
        return
    }
    if (!pluginOption || typeof pluginOption !== 'object') {
        return
    }

    const plugin = pluginOption as ViteTransformPlugin
    if (plugin.name === 'builtin:vite-transform' && plugin._options?.transformOptions) {
        plugin._options.transformOptions.sourcemap = false
    }
}

/** Configures Vite's native reporter with the WeChat 2 MB JavaScript warning threshold and no gzip work. */
function createViteReporter(server: ViteDevServer) {
    const { build, logger, root } = server.config
    return viteReporterPlugin({
        root,
        isTty: Boolean(process.stdout.isTTY && !process.env.CI),
        isLib: Boolean(build.lib),
        assetsDir: path.join(build.assetsDir, '/'),
        // chunkLimit: build.chunkSizeWarningLimit,
        chunkLimit: 2000,
        // warnLargeChunks: Boolean(build.minify && !build.lib),
        warnLargeChunks: true,
        reportCompressedSize: false,
        logInfo: (message) => logger.info(message)
    })
}

function getBundledDev(server: ViteDevServer): LegacyBundledDev {
    const bundledDev = server.environments.client.bundledDev as unknown as LegacyBundledDev | undefined
    if (!bundledDev) {
        throw new Error('Vite did not create the wx bundled-development environment.')
    }
    return bundledDev
}
