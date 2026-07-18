import path from 'node:path'
import type { ResolvedConfig, ViteDevServer } from 'vite'
import {
    controlFileName,
    createWxDevelopmentOutput,
    updateFileName,
    type WxDevelopmentOutput,
    writeWxDevelopmentOutput
} from './output.ts'

const clientId = 'vite-plugin-taro-wx'
const rolldownRuntimeBinding = 'const __rolldown_runtime__ = global.__rolldown_runtime__;'

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
    storeOutputFiles(output: WxDevelopmentOutput): void
    listen(): Promise<void>
}

type OutputAddon = string | ((chunk: { fileName: string }) => string | Promise<string>)
type DevelopmentPhase = 'starting' | 'ready' | 'closed'
type DevelopmentState = Readonly<{
    phase: DevelopmentPhase
    initialWrite?: Promise<void>
    writeTail: Promise<void>
    rebuildTail: Promise<void>
    bundledModules: ReadonlySet<string>
}>

/**
 * Minimal host implementation used while source updates deliberately rematerialize the complete physical project.
 *
 * Rolldown injects this source into its generated helper runtime. It must therefore be self-contained and must not use
 * browser transports, DOM APIs, or executable code fetched over HTTP. Patch application is added in the next phase.
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
global.__rolldown_runtime__ = new WxDevRuntime();
`

/** Installs the one guarded private Vite adapter used by wx bundled development. */
export function installWxBundledDevelopment({
    server,
    pagePaths
}: {
    server: ViteDevServer
    pagePaths: readonly string[]
}): { close(): Promise<void> } {
    const session = new WxBundledDevelopment(server, pagePaths)
    session.install()
    return session
}

/** Owns all mutable development state as one immutable snapshot. */
class WxBundledDevelopment {
    private readonly server: ViteDevServer
    private readonly bundledDevelopment: BundledDevelopment
    private readonly outDir: string
    private readonly pageFiles: ReadonlySet<string>
    private readonly pageStyleFiles: ReadonlySet<string>
    private readonly client: DevelopmentClient = {
        send: (payload) => this.handleClientPayload(payload)
    }
    private state: DevelopmentState = {
        phase: 'starting',
        writeTail: Promise.resolve(),
        rebuildTail: Promise.resolve(),
        bundledModules: new Set()
    }

    constructor(server: ViteDevServer, pagePaths: readonly string[]) {
        this.server = server
        this.outDir = path.resolve(server.config.root, server.config.build.outDir)
        const bundledDevelopment = server.environments.client.bundledDev as unknown as BundledDevelopment | undefined
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
        this.pageFiles = new Set(pagePaths.map((pagePath) => `${pagePath}.js`))
        this.pageStyleFiles = new Set(pagePaths.map((pagePath) => `${pagePath}.wxss`))
    }

    install(): void {
        this.installRolldownOptions()
        this.installOutputWriter()
        this.installFullRematerialization()
        this.installInitialBuildBarrier()
    }

    async close(): Promise<void> {
        const current = this.state
        if (current.phase === 'closed') return
        this.state = { ...current, phase: 'closed' }
        await current.rebuildTail
        await this.state.writeTail
    }

    private installRolldownOptions(): void {
        const getRolldownOptions = this.bundledDevelopment.getRolldownOptions.bind(this.bundledDevelopment)

        this.bundledDevelopment.getRolldownOptions = async () => {
            const rolldownOptions = await getRolldownOptions()
            const output = getFirstOutput(rolldownOptions)
            const configuredOutput = getConfiguredOutput(this.server.config)
            const configuredBanner = configuredOutput.banner as OutputAddon | undefined

            // Vite bundled development replaces filename callbacks after resolving normal build configuration. Restore
            // the complete wx fragment so development uses production's native paths, capsule placement, and hashes.
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
                // Browser lazy compilation returns JavaScript over HTTP. wx materializes every discoverable capsule as
                // a physical Mini Program file instead.
                lazy: false,
                implement: wxDevRuntimeSource
            }

            return rolldownOptions
        }
    }

    private installOutputWriter(): void {
        const storeOutputFiles = this.bundledDevelopment.storeOutputFiles.bind(this.bundledDevelopment)

        this.bundledDevelopment.storeOutputFiles = (output) => {
            storeOutputFiles(output)
            const current = this.state
            if (current.phase === 'closed') return

            const revision = createWxDevelopmentOutput(output, this.pageStyleFiles)
            const clearOutput =
                revision.complete && !current.initialWrite && this.server.config.build.emptyOutDir !== false
            const write = current.writeTail.then(() =>
                writeWxDevelopmentOutput({
                    config: this.server.config,
                    outDir: this.outDir,
                    ...revision,
                    clearOutput
                })
            )
            const writeTail = write.catch((error: unknown) => this.reportWriteError(error))
            let bundledModules = current.bundledModules

            if (revision.complete) {
                const outputModules = getBundledModules(output, this.server.config.root)
                if (current.phase === 'ready') {
                    this.registerBundleModules(outputModules)
                } else {
                    // A complete DevEngine callback contains every chunk, so its immutable module set replaces rather
                    // than copies or merges the previous startup snapshot.
                    bundledModules = outputModules
                }
            }

            this.state = {
                ...current,
                initialWrite: current.initialWrite ?? (revision.complete ? write : undefined),
                writeTail,
                bundledModules
            }
        }
    }

    private installFullRematerialization(): void {
        this.bundledDevelopment.handleHmrOutput = (_client, _files, update) => {
            // DevEngine already creates complete output for FullReload. A Patch normally creates only its native update
            // program, so Phase 1 upgrades that case explicitly instead of publishing the patch.
            const current = this.state
            if (update.type !== 'Patch' || current.phase !== 'ready') return

            const rebuild = current.rebuildTail.then(async () => {
                if (this.state.phase === 'closed') return
                const engine = this.requireEngine()
                engine.triggerFullBuild()
                await engine.ensureLatestBuildOutput()
                await this.state.writeTail
            })
            this.state = {
                ...current,
                rebuildTail: rebuild.catch((error: unknown) => this.reportRematerializationError(error))
            }
        }
    }

    private installInitialBuildBarrier(): void {
        const listen = this.bundledDevelopment.listen.bind(this.bundledDevelopment)

        this.bundledDevelopment.listen = async () => {
            await listen()
            const engine = this.requireEngine()
            this.bundledDevelopment.clients.setupIfNeeded(this.client, clientId)
            await engine.ensureCurrentBuildFinish()

            if ((await engine.getBundleState()).lastBuildErrored) {
                throw new Error('The initial wx bundled-development build failed.')
            }
            if (!this.state.initialWrite) {
                throw new Error('The initial wx bundled-development build produced no app.js output.')
            }

            await this.state.initialWrite
            await this.state.writeTail
            this.registerBundleModules(this.state.bundledModules)
            this.state = { ...this.state, phase: 'ready', bundledModules: new Set() }
            this.server.config.logger.info(`[vite-plugin-taro] wx project materialized at ${this.outDir}`)
        }
    }

    private registerBundleModules(moduleIds: ReadonlySet<string>): void {
        this.requireEngine().registerModules(clientId, [...moduleIds])
    }

    private reportWriteError(error: unknown): void {
        const normalizedError = error instanceof Error ? error : new Error(String(error))
        this.server.config.logger.error('[vite-plugin-taro] wx output write failed', { error: normalizedError })
    }

    private reportRematerializationError(error: unknown): void {
        if (this.state.phase === 'closed') return
        const normalizedError = error instanceof Error ? error : new Error(String(error))
        this.server.config.logger.error('[vite-plugin-taro] wx rematerialization failed', { error: normalizedError })
    }

    private handleClientPayload(payload: unknown): void {
        if (typeof payload !== 'object' || payload === null) return
        const candidate = payload as { type?: unknown; err?: { message?: unknown } }
        if (candidate.type === 'error' && typeof candidate.err?.message === 'string') {
            this.server.config.logger.error(`[vite-plugin-taro] wx DevEngine failed: ${candidate.err.message}`)
        }
    }

    private requireEngine(): DevelopmentEngine {
        const engine = this.bundledDevelopment._devEngine
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

/**
 * Composes user output banners with the explicit wx runtime binding and native HMR dependencies.
 *
 * WeChat's `global` properties do not become lexical bindings. Rolldown emits calls through the free
 * `__rolldown_runtime__` identifier, so every physical output module captures the runtime from `global` explicitly.
 */
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

function createNativeDevelopmentDependency(fileName: string, pageFiles: ReadonlySet<string>): string {
    if (fileName === 'app.js') return `require(${JSON.stringify(`./${controlFileName}`)});`
    if (!pageFiles.has(fileName)) return ''

    const root = '../'.repeat(fileName.split('/').length - 1)
    return `require(${JSON.stringify(`${root}${updateFileName}`)});`
}

function getBundledModules(output: WxDevelopmentOutput, root: string): ReadonlySet<string> {
    return new Set(
        output.flatMap((file) =>
            file.type === 'chunk' ? file.moduleIds.map((moduleId) => toStableModuleId(moduleId, root)) : []
        )
    )
}

function toStableModuleId(moduleId: string, root: string): string {
    const normalizedId = moduleId.replaceAll('\\', '/')
    const normalizedRoot = root.replaceAll('\\', '/')
    if (normalizedId.startsWith('\0') || !path.posix.isAbsolute(normalizedId)) return normalizedId
    return path.posix.relative(normalizedRoot, normalizedId)
}
