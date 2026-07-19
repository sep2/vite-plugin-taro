import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import colors from 'picocolors'
import type { InputOptions, OutputOptions } from 'rolldown'
import { type DevEngine, dev, viteReporterPlugin } from 'rolldown/experimental'
import type { ViteDevServer } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { resolvePackageFile } from '../../../utils/packages.ts'
import { SerializedTaskQueue } from '../../../utils/serialized-task-queue.ts'
import { createHmrInfo, hmrInfoFileName, renderHmrInfo } from './hmr-info.ts'
import { hmrUpdateFileName, renderInitialHmrUpdate } from './hmr-update.ts'

type BundledDevRolldownOptions = InputOptions & {
    output?: OutputOptions | OutputOptions[]
    experimental?: {
        devMode?: boolean | Record<string, unknown>
        [key: string]: unknown
    }
}

/** The deliberately small Vite 8.1 private surface used by the wx adapter. */
type BundledDev = {
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

// This path belongs to DevHost: it will both render the HMR URL and install the matching Vite middleware.
const hmrRequestPath = '/__vite_plugin_taro_wx_hmr__'

/**
 * Coordinates the one Vite environment, one Rolldown DevEngine, and one physical wx output directory.
 *
 * Vite continues to own configuration resolution and shutdown. This adapter owns only the DevEngine options, initial
 * physical output preparation, and public-directory synchronization required by WeChat DevTools.
 */
export class DevHost {
    private readonly server: ViteDevServer
    private readonly bundledDev: BundledDev

    private readonly outDir: string
    private readonly pageFiles: ReadonlySet<string>

    // Generated output bypasses this queue and is written directly by Rolldown. It serializes only initial directory
    // preparation and public-file events, whose asynchronous filesystem operations must preserve watcher order.
    private readonly fileTasks = new SerializedTaskQueue()

    private readonly handleWatcherEvent = (event: string, filePath: string): void => {
        // Vite already watches the project and public directory. Ignore every event outside publicDir so source changes
        // remain exclusively owned by the DevEngine's watcher and cannot accidentally request a full rematerialization.
        const destinationPath = this.getPublicDestination(filePath)
        if (!destinationPath) {
            return
        }

        // The queue was seeded with output preparation, so even an event received before listen() runs cannot race the
        // initial cleanup/copy. Public-file errors are recoverable and handled inside the task so they do not stop later
        // synchronization; the unhandled initial-preparation task remains fatal to startup.
        this.fileTasks.enqueue(async () => {
            try {
                await syncPublicDirFiles(event, filePath, destinationPath)
            } catch (error) {
                this.reportError('public file sync', error)
            }
        })
    }

    constructor(server: ViteDevServer, options: VitePluginTaroOptions) {
        this.server = server
        this.bundledDev = getBundledDev(server)

        this.outDir = path.resolve(server.config.root, server.config.build.outDir)

        // Page entry identities are exact native paths. They need the inert update dependency; application capsules and
        // shared chunks must not receive it because only native Page evaluation is observable by WeChat DevTools.
        this.pageFiles = new Set(options.pages.map((page) => `${page.path}.js`))

        // Seed the queue with mandatory output preparation. Its rejection remains on the queue tail, so listen() fails,
        // and no DevEngine starts when the initial cleanup or public-directory copy is unsuccessful.
        this.fileTasks.enqueue(() =>
            initializePublicDirOutput({
                outDir: this.outDir,
                publicDir: server.config.publicDir || '',
                emptyOutDir: server.config.build.emptyOutDir !== false
            })
        )

        // Ordering matters: the replacement listen() calls the wrapped option resolver, and both replacements must be in
        // place before Vite starts the client environment after configureServer hooks complete.
        this.installRolldownOptions()
        this.installDevEngine()
        this.server.watcher.on('all', this.handleWatcherEvent)

        // The DevEngine initial build runs before Vite binds HTTP, so hmr/info.js cannot contain the final URL yet.
        // Create both HMR files only after binding; if middleware supplies an already-listening server, do it immediately.
        if (this.server.httpServer?.listening) {
            this.initializeHmrFiles()
        } else {
            this.server.httpServer?.once('listening', this.initializeHmrFiles)
        }
    }

    async close(): Promise<void> {
        this.server.httpServer?.off('listening', this.initializeHmrFiles)
        this.server.watcher.off('all', this.handleWatcherEvent)
        await this.fileTasks.waitForIdle()
        // Do not close the DevEngine here. Vite closes `_devEngine`, which invokes plugin closeBundle hooks including this
        // method; closing it here would recurse through the same lifecycle.
    }

    private readonly initializeHmrFiles = (): void => {
        this.fileTasks.enqueue(async () => {
            try {
                const origin = this.server.resolvedUrls?.local[0]
                if (!origin) {
                    throw new Error('Vite did not resolve a local development URL for WX HMR.')
                }

                await Promise.all([
                    writeHmrFile(
                        this.outDir,
                        hmrInfoFileName,
                        renderHmrInfo(createHmrInfo(new URL(hmrRequestPath, origin).href))
                    ),
                    writeHmrFile(this.outDir, hmrUpdateFileName, renderInitialHmrUpdate())
                ])
                this.printDevToolsPath()
            } catch (error) {
                this.reportError('HMR file initialization', error)
            }
        })
    }

    /** Restores wx output semantics that Vite's bundled-development resolver replaces with browser defaults. */
    private installRolldownOptions(): void {
        const getRolldownOptions = this.bundledDev.getRolldownOptions.bind(this.bundledDev)

        const devRuntimePath = resolvePackageFile('dist/runtime/wx/dev/dev-runtime.js')
        const devRuntimeSource = readFileSync(devRuntimePath, 'utf8')

        this.bundledDev.getRolldownOptions = async () => {
            const rolldownOptions = await getRolldownOptions()
            if (Array.isArray(rolldownOptions.output)) {
                throw new Error('wx development supports one Rolldown output.')
            }

            rolldownOptions.output ??= {}
            const output = rolldownOptions.output
            const configuredOutput = this.server.config.build.rolldownOptions.output
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
                banner: createDevelopmentBanner(configuredBanner, this.pageFiles)
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
            rolldownOptions.plugins = [rolldownOptions.plugins, createViteReporter(this.server)]

            disableViteOxcSourcemap(rolldownOptions.plugins)

            return rolldownOptions
        }
    }

    /** Creates the one DevEngine with direct disk writing for the initial build and patch-only later changes. */
    private installDevEngine(): void {
        // Vite's bundled HTML middleware calls this method when its memory bundle is stale. Its default implementation
        // invokes ensureLatestBuildOutput(), which would enter Rolldown's write path merely because a browser loaded `/`.
        // The wx application is consumed from the physical directory, so HTTP access must never control its revision.
        this.bundledDev.triggerBundleRegenerationIfStale = async () => false

        this.bundledDev.listen = async () => {
            await this.fileTasks.waitForIdle()

            const rolldownOptions = await this.bundledDev.getRolldownOptions()
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
                // Successful patches are intentionally left inside the callback boundary for now. The real HMR work will
                // register the active runtime client and publish these results through physical `hmr/update.js`.
                onHmrUpdates: (result) => {
                    if (result instanceof Error) this.reportError('HMR generation', result)
                },
                onOutput: (result) => {
                    if (result instanceof Error) {
                        this.reportError('build', result)
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
            this.bundledDev._devEngine = engine

            void engine.run().catch((error: unknown) => {
                this.reportError('DevEngine', error)
                initialOutput.reject(error)
            })

            await initialOutput.promise
        }
    }

    /** Prints the project location only after hmr/info.js exists with Vite's final listening URL. */
    private printDevToolsPath(): void {
        const relativeOutDir = path.relative(this.server.config.root, this.outDir).split(path.sep).join('/')
        const devToolsPath = relativeOutDir ? `./${relativeOutDir}` : '.'
        this.server.config.logger.info(
            `  ${colors.green('➜')}  ${colors.bold(colors.cyan('WeChat DevTools:'))} ${colors.cyan(devToolsPath)}`
        )
    }

    /** Maps only paths contained by publicDir into their identical relative location beneath outDir. */
    private getPublicDestination(filePath: string): string | undefined {
        const publicDir = this.server.config.publicDir
        if (!publicDir) {
            return
        }

        const relativePath = path.relative(publicDir, filePath)
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
            return
        }

        return path.join(this.outDir, relativePath)
    }

    private reportError(operation: string, error: unknown): void {
        const normalizedError = error instanceof Error ? error : new Error(String(error))
        this.server.config.logger.error(`[vite-plugin-taro] wx ${operation} failed`, { error: normalizedError })
    }
}

/**
 * Performs the small part of Vite's prepare-out-dir behavior needed by physical bundled development.
 *
 * Rolldown owns every generated file because the DevEngine runs with skipWrite:false. This helper runs only before the
 * engine starts: it optionally removes the previous project, creates the destination, and copies public files that are
 * outside Rolldown's bundle graph.
 */
async function initializePublicDirOutput({
    outDir,
    publicDir,
    emptyOutDir
}: {
    outDir: string
    publicDir: string
    emptyOutDir: boolean
}): Promise<void> {
    if (emptyOutDir) await fs.rm(outDir, { recursive: true, force: true })
    await fs.mkdir(outDir, { recursive: true })
    if (!publicDir) return

    try {
        await fs.cp(publicDir, outDir, { recursive: true, force: true })
    } catch (error) {
        // Vite permits a configured/default public directory that does not exist. Match that behavior while preserving
        // every other filesystem failure, including permissions and invalid destinations.
        if (!isMissingFileError(error)) throw error
    }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

/**
 * Mirrors one Vite watcher event from publicDir into the physical Mini Program directory.
 *
 * Copying only the changed path preserves generated files and makes deletion semantics explicit; no rebuild or complete
 * public-directory recopy is needed after startup.
 */
async function syncPublicDirFiles(event: string, sourcePath: string, destinationPath: string): Promise<void> {
    if (event === 'unlink' || event === 'unlinkDir') {
        // Recursive removal is reserved for an actual directory event so a malformed file event cannot remove siblings.
        await fs.rm(destinationPath, { recursive: event === 'unlinkDir', force: true })
        return
    }
    if (event === 'addDir') {
        await fs.mkdir(destinationPath, { recursive: true })
        return
    }
    if (event !== 'add' && event !== 'change') return

    await fs.mkdir(path.dirname(destinationPath), { recursive: true })
    await fs.copyFile(sourcePath, destinationPath)
}

/** Atomically writes one DevHost-owned HMR file without involving Rolldown's normal output lifecycle. */
async function writeHmrFile(outDir: string, fileName: string, source: string): Promise<void> {
    const filePath = path.join(outDir, fileName)
    const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    try {
        await fs.writeFile(temporaryPath, source)
        await fs.rename(temporaryPath, filePath)
    } finally {
        await fs.rm(temporaryPath, { force: true })
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
// BuiltinPlugin keeps the constructor options on this private field until Rolldown consumes them, so disable that wasted
// work at the same private boundary where DevHost already replaces Vite's DevEngine startup.
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

function getBundledDev(server: ViteDevServer) {
    const bundledDev = server.environments.client.bundledDev as unknown as BundledDev | undefined
    if (!bundledDev) {
        throw new Error('Vite did not create the wx bundled-development environment.')
    }
    return bundledDev
}
