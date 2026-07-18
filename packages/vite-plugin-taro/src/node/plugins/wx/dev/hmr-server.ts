import fs from 'node:fs/promises'
import path from 'node:path'
import type { InputOptions, OutputOptions } from 'rolldown'
import { type DevEngine, dev } from 'rolldown/experimental'
import type { ViteDevServer } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { controlFileName, updateFileName } from './output.ts'
import { SerializedTaskQueue } from './serialized-task-queue.ts'

// Rolldown's generated development modules reference this lexical binding. Native and SystemJS-rendered chunks cannot
// import a browser HMR client, so every physical development chunk binds it to the one runtime installed on `global`.
const rolldownRuntimeBinding = 'const __rolldown_runtime__ = global.__rolldown_runtime__;'

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

/**
 * Minimal host implementation used until the physical update transport starts applying Rolldown patches.
 *
 * Rolldown injects this string into its generated helper runtime, so it must be self-contained and executable in the
 * WeChat JavaScript heap. The hot-context methods deliberately do nothing for now: the DevEngine computes patch-only
 * updates, but no update is delivered or applied until the physical `update.js` publisher exists. Keeping the real base
 * `DevRuntime` still gives every initially rendered module the exact instrumentation and stable IDs required by that
 * future implementation.
 */
const wxDevRuntimeSource = `
var WxBaseDevRuntime = DevRuntime;
class WxHotContext {
  constructor(moduleId) {
    this.moduleId = moduleId;
    this.data = {};
    this._internal = { updateStyle() {}, removeStyle() {} };
  }
  accept() {}
  acceptExports() {}
  dispose() {}
  prune() {}
  invalidate() {}
  on() {}
  off() {}
  send() {}
}
class WxDevRuntime extends WxBaseDevRuntime {
  constructor() {
    super({ send() {} }, 'vite-plugin-taro-wx');
  }
  createModuleHotContext(moduleId) {
    return new WxHotContext(moduleId);
  }
  applyUpdates() {}
}
global.__rolldown_runtime__ = new WxDevRuntime();
`

/**
 * Coordinates the one Vite environment, one Rolldown DevEngine, and one physical wx output directory.
 *
 * Vite continues to own configuration resolution and shutdown. This adapter owns only the DevEngine options, initial
 * physical output preparation, and public-directory synchronization required by WeChat DevTools.
 */
export class HmrServer {
    private readonly server: ViteDevServer
    private readonly bundledDev: BundledDev

    private readonly outDir: string
    private readonly publicDir: string
    private readonly pageFiles: ReadonlySet<string>

    // Generated output bypasses this queue and is written directly by Rolldown. It serializes only initial directory
    // preparation and public-file events, whose asynchronous filesystem operations must preserve watcher order.
    private readonly fileTasks = new SerializedTaskQueue()

    private readonly handleWatcherEvent = (event: string, filePath: string): void => {
        // Vite already watches the project and public directory. Ignore every event outside publicDir so source changes
        // remain exclusively owned by the DevEngine's watcher and cannot accidentally request a full rematerialization.
        const destinationPath = this.getPublicDestination(filePath)
        if (!destinationPath) return

        // The queue was seeded with output preparation, so even an event received before listen() runs cannot race the
        // initial cleanup/copy. Public-file errors are recoverable and handled inside the task so they do not stop later
        // synchronization; the unhandled initial-preparation task remains fatal to startup.
        this.fileTasks.enqueue(async () => {
            try {
                await syncWxPublicFile(event, filePath, destinationPath)
            } catch (error) {
                this.reportError('public file sync', error)
            }
        })
    }

    constructor(server: ViteDevServer, options: VitePluginTaroOptions) {
        this.server = server
        this.bundledDev = getBundledDev(server)

        this.outDir = path.resolve(server.config.root, server.config.build.outDir)
        this.publicDir = server.config.publicDir ? path.resolve(server.config.publicDir) : ''
        // Page entry identities are exact native paths. They need the inert update dependency; application capsules and
        // shared chunks must not receive it because only native Page evaluation is observable by WeChat DevTools.
        this.pageFiles = new Set(options.pages.map((page) => `${page.path}.js`))

        // Seed the queue with mandatory output preparation. Its rejection remains on the queue tail, so listen() fails
        // and no DevEngine starts when the initial cleanup or public-directory copy is unsuccessful.
        this.fileTasks.enqueue(() =>
            initializeWxDevelopmentOutput({
                outDir: this.outDir,
                publicDir: this.publicDir,
                emptyOutDir: server.config.build.emptyOutDir !== false
            })
        )
    }

    install(): this {
        // Ordering matters: the replacement listen() calls the wrapped option resolver, and both replacements must be in
        // place before Vite starts the client environment after configureServer hooks complete.
        this.installRolldownOptions()
        this.installDevEngine()
        this.server.watcher.on('all', this.handleWatcherEvent)
        return this
    }

    async close(): Promise<void> {
        this.server.watcher.off('all', this.handleWatcherEvent)
        await this.fileTasks.waitForIdle()
        // Do not close the DevEngine here. Vite closes `_devEngine`, which invokes plugin closeBundle hooks including this
        // method; closing it here would recurse through the same lifecycle.
    }

    /** Restores wx output semantics that Vite's bundled-development resolver replaces with browser defaults. */
    private installRolldownOptions(): void {
        const getRolldownOptions = this.bundledDev.getRolldownOptions.bind(this.bundledDev)

        this.bundledDev.getRolldownOptions = async () => {
            const rolldownOptions = await getRolldownOptions()
            if (Array.isArray(rolldownOptions.output)) throw new Error('wx development supports one Rolldown output.')
            rolldownOptions.output ??= {}
            const output = rolldownOptions.output
            const configuredOutput = this.server.config.build.rolldownOptions.output
            if (Array.isArray(configuredOutput)) throw new Error('wx development supports one configured output.')
            const configured = (configuredOutput ?? {}) as Record<string, unknown>
            const configuredBanner = configured.banner as OutputAddon | undefined

            // Apply the complete configured output first so placement groups, preserveEntrySignatures, user ordering, and
            // any future wx output option survive. Only development-specific rendering and filenames are overridden.
            Object.assign(output, configured, {
                format: 'es',
                minify: false,
                sourcemap: true,
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
                implement: wxDevRuntimeSource
            }

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
                // register the active runtime client and publish these results through physical `vpt-hmr/update.js`.
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

            this.server.config.logger.info(`[vite-plugin-taro] wx project writes at ${this.outDir}`)
        }
    }

    /** Maps only paths contained by publicDir into their identical relative location beneath outDir. */
    private getPublicDestination(filePath: string): string | undefined {
        if (!this.publicDir) return
        const relativePath = path.relative(this.publicDir, filePath)
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) return
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
async function initializeWxDevelopmentOutput({
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
export async function syncWxPublicFile(event: string, sourcePath: string, destinationPath: string): Promise<void> {
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

/** Composes user banners with the wx runtime binding and native development dependencies. */
function createDevelopmentBanner(
    configuredBanner: OutputAddon | undefined,
    pageFiles: ReadonlySet<string>
): (chunk: { fileName: string }) => Promise<string> {
    return async (chunk) => {
        const configured =
            typeof configuredBanner === 'function' ? await configuredBanner(chunk) : (configuredBanner ?? '')

        const development = createNativeDevelopmentDependency(chunk.fileName, pageFiles)

        return [configured, rolldownRuntimeBinding, development].filter(Boolean).join('\n')
    }
}

/** Adds literal native dependencies whose paths are valid from the final physical entry location. */
function createNativeDevelopmentDependency(fileName: string, pageFiles: ReadonlySet<string>): string {
    // App synchronously establishes the build/session metadata before application capsules can execute.
    if (fileName === 'app.js') return `require(${JSON.stringify(`./${controlFileName}`)});`
    if (!pageFiles.has(fileName)) return ''

    // Page entries can be nested at arbitrary route depths. Derive the literal root-relative require from the rendered
    // filename instead of assuming the conventional `pages/<route>/index.js` depth.
    const root = '../'.repeat(fileName.split('/').length - 1)
    return `require(${JSON.stringify(`${root}${updateFileName}`)});`
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

function getBundledDev(server: ViteDevServer) {
    const bundledDev = server.environments.client.bundledDev as unknown as BundledDev | undefined
    if (!bundledDev) {
        throw new Error('Vite did not create the wx bundled-development environment.')
    }
    return bundledDev
}
