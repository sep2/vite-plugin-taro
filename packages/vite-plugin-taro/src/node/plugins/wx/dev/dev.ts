import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Plugin, ResolvedConfig, Rolldown, ViteDevServer } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'

const clientId = 'vite-plugin-taro-wx'
const developmentDirectory = 'vpt-hmr'
const controlFileName = `${developmentDirectory}/control.js`
const updateFileName = `${developmentDirectory}/update.js`
const rebuildDelay = 50

/** File shape passed to Vite's private bundled-development output store. */
type DevelopmentOutput = Array<Rolldown.OutputAsset | Rolldown.OutputChunk>

type DevelopmentEngine = {
    ensureCurrentBuildFinish(): Promise<void>
    ensureLatestBuildOutput(): Promise<unknown>
    getBundleState(): Promise<{ lastBuildErrored: boolean }>
    registerModules(clientId: string, moduleIds: string[]): void
    triggerFullBuild(): void
}

type DevelopmentRolldownOptions = {
    output?: Record<string, unknown> | Array<Record<string, unknown>>
    experimental?: {
        devMode?: boolean | Record<string, unknown>
        [key: string]: unknown
    }
    [key: string]: unknown
}

type DevelopmentClient = {
    send(payload: unknown): void
}

type DevelopmentUpdate = { type: 'Noop' | 'FullReload' | 'Patch' }

type BundledDevelopment = {
    _devEngine?: DevelopmentEngine
    clients: {
        setupIfNeeded(client: DevelopmentClient, clientId: string): void
    }
    getRolldownOptions(): Promise<DevelopmentRolldownOptions>
    handleHmrOutput(client: DevelopmentClient, files: string[], update: DevelopmentUpdate, invalidation?: unknown): void
    storeOutputFiles(output: DevelopmentOutput): void
    listen(): Promise<void>
}

type MaterializedFile = {
    fileName: string
    source: string | Uint8Array
}

type OutputAddon = string | ((chunk: { fileName: string }) => string | Promise<string>)

/**
 * Minimal host implementation used while development updates deliberately rematerialize the complete physical project.
 *
 * Rolldown injects this source into its generated helper runtime. It must therefore be self-contained and must not use
 * browser transports, DOM APIs, or executable code fetched over HTTP. Phase 1 records hot contexts only so Vite and the
 * React transform can instrument modules without installing their browser client; patch application is added later.
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
    super({ send() {} }, ${JSON.stringify(clientId)});
  }
  createModuleHotContext(moduleId) {
    return new WxHotContext(moduleId);
  }
  applyUpdates() {}
}
globalThis.__rolldown_runtime__ = new WxDevRuntime();
`

/** Adds the serve-only bundled-development materializer for the wx target. */
export function createWxDevelopmentPlugin(options: VitePluginTaroOptions): Plugin {
    let session: WxDevelopmentSession | undefined

    return {
        name: 'vite-plugin-taro:wx-dev',
        apply: 'serve',

        config() {
            return {
                experimental: {
                    bundledDev: true
                }
            }
        },

        configureServer: {
            order: 'post',
            handler(server) {
                session = new WxDevelopmentSession(server, options)
                session.install()
            }
        },

        closeBundle() {
            return session?.close()
        }
    }
}

/** Owns the one DevEngine, rebuild scheduler, and physical output directory used by wx development. */
class WxDevelopmentSession {
    private readonly server: ViteDevServer
    private readonly outDir: string
    private readonly pageFiles: ReadonlySet<string>
    private readonly pageStyleFiles: ReadonlySet<string>
    private bundledDevelopment: BundledDevelopment | undefined
    private initialWrite: Promise<void> | undefined
    private writeTail: Promise<void> = Promise.resolve()
    private manifest = new Set<string>()
    private readonly outputFiles = new Map<string, string | Uint8Array>()
    private readonly volatileFiles = new Set<string>()
    private readonly bundledModules = new Set<string>()
    private readonly client: DevelopmentClient = {
        send: (payload) => this.handleClientPayload(payload)
    }
    private initialOutputCommitted = false
    private clientRegistered = false
    private ready = false
    private closed = false
    private rebuildRequested = false
    private rebuildRunning: Promise<void> | undefined
    private rebuildTimer: NodeJS.Timeout | undefined

    constructor(server: ViteDevServer, options: VitePluginTaroOptions) {
        this.server = server
        this.outDir = path.resolve(server.config.root, server.config.build.outDir)
        this.pageFiles = new Set(options.pages.map((page) => `${page.path}.js`))
        this.pageStyleFiles = new Set(options.pages.map((page) => `${page.path}.wxss`))
    }

    install(): void {
        const bundledDevelopment = this.server.environments.client.bundledDev as unknown as
            | BundledDevelopment
            | undefined

        if (!bundledDevelopment) {
            throw new Error('vite-plugin-taro requires Vite bundled development for wx development.')
        }
        if (
            typeof bundledDevelopment.getRolldownOptions !== 'function' ||
            typeof bundledDevelopment.handleHmrOutput !== 'function' ||
            typeof bundledDevelopment.storeOutputFiles !== 'function' ||
            typeof bundledDevelopment.listen !== 'function' ||
            typeof bundledDevelopment.clients?.setupIfNeeded !== 'function'
        ) {
            throw new Error('vite-plugin-taro does not support this Vite bundled-development API shape.')
        }

        this.bundledDevelopment = bundledDevelopment
        this.installRolldownOptions(bundledDevelopment)
        this.installOutputMaterializer(bundledDevelopment)
        this.installFullRematerialization(bundledDevelopment)
        this.installInitialBuildBarrier(bundledDevelopment)
    }

    async close(): Promise<void> {
        if (this.closed) return
        this.closed = true
        this.ready = false
        if (this.rebuildTimer) clearTimeout(this.rebuildTimer)
        this.rebuildTimer = undefined
        await this.rebuildRunning
        await this.writeTail
    }

    private installRolldownOptions(bundledDevelopment: BundledDevelopment): void {
        const getRolldownOptions = bundledDevelopment.getRolldownOptions.bind(bundledDevelopment)

        bundledDevelopment.getRolldownOptions = async () => {
            const rolldownOptions = await getRolldownOptions()
            const output = getFirstOutput(rolldownOptions)
            const configuredOutput = getConfiguredOutput(this.server.config)
            const configuredBanner = configuredOutput.banner as OutputAddon | undefined

            // Vite bundled development replaces filename callbacks after resolving normal build configuration. Restore
            // the complete wx fragment so initial development output uses the same native paths, capsule placement, and
            // transport hashes as production. The format remains ESM until the normal wx renderChunk hooks classify it.
            Object.assign(output, configuredOutput, {
                format: 'es',
                minify: false,
                sourcemap: true,
                banner: createDevelopmentBanner(configuredBanner, this.pageFiles)
            })

            rolldownOptions.experimental ??= {}
            rolldownOptions.experimental.devMode = {
                ...(typeof rolldownOptions.experimental.devMode === 'object'
                    ? rolldownOptions.experimental.devMode
                    : {}),
                // Browser lazy compilation returns JavaScript over HTTP. wx development instead materializes every
                // currently discoverable capsule as a physical Mini Program file.
                lazy: false,
                implement: wxDevRuntimeSource
            }

            return rolldownOptions
        }
    }

    private installOutputMaterializer(bundledDevelopment: BundledDevelopment): void {
        const storeOutputFiles = bundledDevelopment.storeOutputFiles.bind(bundledDevelopment)

        bundledDevelopment.storeOutputFiles = (output) => {
            storeOutputFiles(output)

            // DevEngine output objects belong to Rolldown. Snapshot source bytes synchronously before enqueueing disk IO
            // so a later incremental build cannot mutate the physical revision currently being committed.
            const files = snapshotOutput(output, this.pageStyleFiles)
            const complete = files.some((file) => file.fileName === 'app.js')

            if (complete) {
                // DevEngine full rebuilds contain every chunk but omit unchanged generateBundle assets. Replace the
                // volatile JavaScript revision while retaining the latest JSON/WXML/WXSS and imported assets collected
                // from initial and additional-asset callbacks.
                for (const fileName of this.volatileFiles) this.outputFiles.delete(fileName)
                this.volatileFiles.clear()
                for (const fileName of getVolatileFileNames(output)) this.volatileFiles.add(fileName)
                addDevelopmentFiles(files)
                this.registerBundleModules(output)
            }

            for (const file of files) this.outputFiles.set(file.fileName, file.source)
            const revision = complete
                ? [...this.outputFiles].map(([fileName, source]) => ({ fileName, source }))
                : files
            const write = this.enqueueWrite(() => this.materialize(revision, complete))
            if (complete && !this.initialWrite) this.initialWrite = write
        }
    }

    private installFullRematerialization(bundledDevelopment: BundledDevelopment): void {
        bundledDevelopment.handleHmrOutput = (_client, _files, update) => {
            // DevEngine already creates complete output for FullReload. A Patch normally creates only its native update
            // program, so Phase 1 upgrades that case explicitly instead of publishing the patch.
            if (update.type === 'Patch') this.requestRebuild()
        }
    }

    private installInitialBuildBarrier(bundledDevelopment: BundledDevelopment): void {
        const listen = bundledDevelopment.listen.bind(bundledDevelopment)

        bundledDevelopment.listen = async () => {
            await listen()
            const engine = this.requireEngine()
            bundledDevelopment.clients.setupIfNeeded(this.client, clientId)
            this.clientRegistered = true
            engine.registerModules(clientId, [...this.bundledModules])
            await engine.ensureCurrentBuildFinish()

            if ((await engine.getBundleState()).lastBuildErrored) {
                throw new Error('The initial wx bundled-development build failed.')
            }
            if (!this.initialWrite) {
                throw new Error('The initial wx bundled-development build produced no app.js output.')
            }

            await this.initialWrite
            this.ready = true
            this.server.config.logger.info(`[vite-plugin-taro] wx project materialized at ${this.outDir}`)
        }
    }

    private requestRebuild(): void {
        if (!this.ready || this.closed) return

        // Phase 1 deliberately upgrades every DevEngine update to one complete output. The DevEngine remains the only
        // watcher and builder; this merely changes the output requested after its normal invalidation and propagation.
        this.rebuildRequested = true
        if (this.rebuildTimer) clearTimeout(this.rebuildTimer)
        this.rebuildTimer = setTimeout(() => {
            this.rebuildTimer = undefined
            this.rebuildRunning ??= this.runRebuilds().finally(() => {
                this.rebuildRunning = undefined
            })
        }, rebuildDelay)
    }

    private async runRebuilds(): Promise<void> {
        while (this.rebuildRequested && !this.closed) {
            this.rebuildRequested = false
            const engine = this.requireEngine()

            try {
                engine.triggerFullBuild()
                await engine.ensureLatestBuildOutput()
                await this.writeTail
            } catch (error) {
                if (!this.closed) {
                    const normalizedError = error instanceof Error ? error : new Error(String(error))
                    this.server.config.logger.error('[vite-plugin-taro] wx rematerialization failed', {
                        error: normalizedError
                    })
                }
            }
        }
    }

    private enqueueWrite(task: () => Promise<void>): Promise<void> {
        const write = this.writeTail.then(task, task)
        this.writeTail = write.catch((error: unknown) => {
            const normalizedError = error instanceof Error ? error : new Error(String(error))
            this.server.config.logger.error('[vite-plugin-taro] wx output write failed', { error: normalizedError })
        })
        return write
    }

    private async materialize(output: readonly MaterializedFile[], complete: boolean): Promise<void> {
        if (this.closed) return

        const files = new Map<string, string | Uint8Array>()
        if (complete) {
            for (const file of await readPublicFiles(this.server.config.publicDir)) {
                files.set(file.fileName, file.source)
            }
        }
        for (const file of output) files.set(validateFileName(file.fileName), file.source)

        if (complete && !this.initialOutputCommitted && this.server.config.build.emptyOutDir !== false) {
            await fs.rm(this.outDir, { recursive: true, force: true })
        }

        await writeFilesAtomically(this.outDir, files)

        if (complete) {
            for (const staleFile of this.manifest.difference(new Set(files.keys()))) {
                await fs.rm(path.join(this.outDir, staleFile), { force: true })
            }
            this.manifest = new Set(files.keys())
            this.initialOutputCommitted = true
        }
    }

    private registerBundleModules(output: DevelopmentOutput): void {
        for (const file of output) {
            if (file.type !== 'chunk') continue
            for (const moduleId of file.moduleIds)
                this.bundledModules.add(toStableModuleId(moduleId, this.server.config.root))
        }

        if (this.clientRegistered) {
            this.bundledDevelopment?._devEngine?.registerModules(clientId, [...this.bundledModules])
        }
    }

    private handleClientPayload(payload: unknown): void {
        if (typeof payload !== 'object' || payload === null) return
        const candidate = payload as { type?: unknown; err?: { message?: unknown } }
        if (candidate.type === 'error' && typeof candidate.err?.message === 'string') {
            this.server.config.logger.error(`[vite-plugin-taro] wx DevEngine failed: ${candidate.err.message}`)
        }
    }

    private requireEngine(): DevelopmentEngine {
        const engine = this.bundledDevelopment?._devEngine
        if (!engine) throw new Error('Vite did not initialize the wx DevEngine.')
        return engine
    }
}

function getFirstOutput(options: DevelopmentRolldownOptions): Record<string, unknown> {
    if (!options.output) options.output = {}
    if (!Array.isArray(options.output)) return options.output

    const output = options.output[0] ?? {}
    options.output[0] = output
    return output
}

function getConfiguredOutput(config: ResolvedConfig): Record<string, unknown> {
    const output = config.build.rolldownOptions.output
    if (!output) return {}
    return (Array.isArray(output) ? output[0] : output) as Record<string, unknown>
}

/** Composes user output banners with literal native dependencies required by the later HMR transport. */
function createDevelopmentBanner(
    configuredBanner: OutputAddon | undefined,
    pageFiles: ReadonlySet<string>
): (chunk: { fileName: string }) => Promise<string> {
    return async (chunk) => {
        const configured =
            typeof configuredBanner === 'function' ? await configuredBanner(chunk) : (configuredBanner ?? '')
        const development = createNativeDevelopmentDependency(chunk.fileName, pageFiles)
        return [configured, development].filter(Boolean).join('\n')
    }
}

function createNativeDevelopmentDependency(fileName: string, pageFiles: ReadonlySet<string>): string {
    if (fileName === 'app.js') return `require(${JSON.stringify(`./${controlFileName}`)});`
    if (!pageFiles.has(fileName)) return ''

    const root = '../'.repeat(fileName.split('/').length - 1)
    return `require(${JSON.stringify(`${root}${updateFileName}`)});`
}

function snapshotOutput(output: DevelopmentOutput, pageStyleFiles: ReadonlySet<string>): MaterializedFile[] {
    return output.map((file) => {
        const fileName = validateFileName(file.fileName)

        return {
            // The Tailwind Vite adapter assigns its global asset a source-relative wxss filename after Rolldown's asset
            // callback has run. CSS splitting is disabled, and native Page styles are known exact companion files, so
            // every other CSS/WXSS output is the one global stylesheet required at the Mini Program root.
            fileName:
                file.type === 'asset' &&
                (fileName.endsWith('.css') || (fileName.endsWith('.wxss') && !pageStyleFiles.has(fileName)))
                    ? 'app.wxss'
                    : fileName,
            source: file.type === 'chunk' ? file.code : copySource(file.source)
        }
    })
}

function getVolatileFileNames(output: DevelopmentOutput): string[] {
    return output
        .filter((file) => file.type === 'chunk' || file.fileName.endsWith('.js.map'))
        .map((file) => validateFileName(file.fileName))
}

function copySource(source: string | Uint8Array): string | Uint8Array {
    return typeof source === 'string' ? source : source.slice()
}

function addDevelopmentFiles(files: MaterializedFile[]): void {
    const buildId = crypto.randomUUID()
    files.push(
        {
            fileName: controlFileName,
            source: `module.exports = Object.freeze(${JSON.stringify({ buildId, endpoint: '', token: '' })});\n`
        },
        {
            fileName: updateFileName,
            source: 'module.exports = undefined;\n'
        }
    )
}

async function readPublicFiles(publicDir: string): Promise<MaterializedFile[]> {
    if (!publicDir) return []

    try {
        const files: MaterializedFile[] = []
        await collectPublicFiles(publicDir, '', files)
        return files
    } catch (error) {
        if (isMissingFileError(error)) return []
        throw error
    }
}

async function collectPublicFiles(
    directory: string,
    relativeDirectory: string,
    files: MaterializedFile[]
): Promise<void> {
    const entries = await fs.readdir(path.join(directory, relativeDirectory), { withFileTypes: true })
    await Promise.all(
        entries.map(async (entry) => {
            const relativePath = path.posix.join(relativeDirectory.replaceAll('\\', '/'), entry.name)
            if (entry.isDirectory()) {
                await collectPublicFiles(directory, relativePath, files)
            } else if (entry.isFile()) {
                files.push({
                    fileName: validateFileName(relativePath),
                    source: await fs.readFile(path.join(directory, relativePath))
                })
            }
        })
    )
}

/** Writes every temporary sibling before renaming any file, minimizing partially prepared DevTools revisions. */
async function writeFilesAtomically(outDir: string, files: ReadonlyMap<string, string | Uint8Array>): Promise<void> {
    const nonce = crypto.randomUUID()
    const staged: Array<{ temporaryPath: string; destinationPath: string }> = []

    try {
        for (const [fileName, source] of files) {
            const destinationPath = path.join(outDir, fileName)
            const temporaryPath = `${destinationPath}.${nonce}.tmp`
            await fs.mkdir(path.dirname(destinationPath), { recursive: true })
            await fs.writeFile(temporaryPath, source)
            staged.push({ temporaryPath, destinationPath })
        }
        for (const file of staged) await fs.rename(file.temporaryPath, file.destinationPath)
    } catch (error) {
        await Promise.all(staged.map((file) => fs.rm(file.temporaryPath, { force: true })))
        throw error
    }
}

function validateFileName(fileName: string): string {
    const normalized = fileName.replaceAll('\\', '/')
    if (path.posix.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../')) {
        throw new Error(`wx output file escapes outDir: ${fileName}`)
    }
    return normalized
}

function toStableModuleId(moduleId: string, root: string): string {
    const normalizedId = moduleId.replaceAll('\\', '/')
    const normalizedRoot = root.replaceAll('\\', '/')
    if (normalizedId.startsWith('\0') || !path.posix.isAbsolute(normalizedId)) return normalizedId
    return path.posix.relative(normalizedRoot, normalizedId)
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
