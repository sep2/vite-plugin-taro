import path from 'node:path'
import type { ResolvedConfig, ViteDevServer } from 'vite'
import {
    controlFileName,
    updateFileName,
    type WxDevelopmentMaterializer,
    type WxDevelopmentOutput
} from './materializer.ts'

const clientId = 'vite-plugin-taro-wx'

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
globalThis.__rolldown_runtime__ = new WxDevRuntime();
`

/** Installs the one guarded private Vite adapter used by wx bundled development. */
export function installWxBundledDevelopment({
    server,
    materializer,
    pagePaths
}: {
    server: ViteDevServer
    materializer: WxDevelopmentMaterializer
    pagePaths: readonly string[]
}): { close(): Promise<void> } {
    const session = new WxBundledDevelopment(server, materializer, pagePaths)
    session.install()
    return session
}

/** Owns private Vite integration, synthetic client registration, and complete-build requests. */
class WxBundledDevelopment {
    private readonly server: ViteDevServer
    private readonly materializer: WxDevelopmentMaterializer
    private readonly bundledDevelopment: BundledDevelopment
    private readonly pageFiles: ReadonlySet<string>
    private readonly bundledModules = new Set<string>()
    private readonly client: DevelopmentClient = {
        send: (payload) => this.handleClientPayload(payload)
    }
    private phase: DevelopmentPhase = 'starting'
    private initialWrite: Promise<void> | undefined
    private rebuildTail: Promise<void> = Promise.resolve()

    constructor(server: ViteDevServer, materializer: WxDevelopmentMaterializer, pagePaths: readonly string[]) {
        this.server = server
        this.materializer = materializer
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
    }

    install(): void {
        this.installRolldownOptions()
        this.installOutputMaterializer()
        this.installFullRematerialization()
        this.installInitialBuildBarrier()
    }

    async close(): Promise<void> {
        if (this.phase === 'closed') return
        this.phase = 'closed'
        await this.rebuildTail
        await this.materializer.close()
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

    private installOutputMaterializer(): void {
        const storeOutputFiles = this.bundledDevelopment.storeOutputFiles.bind(this.bundledDevelopment)

        this.bundledDevelopment.storeOutputFiles = (output) => {
            storeOutputFiles(output)
            const write = this.materializer.write(output)
            if (!write.complete) return

            this.collectBundleModules(output)
            if (!this.initialWrite) this.initialWrite = write.done
            if (this.phase === 'ready') this.registerBundleModules()
        }
    }

    private installFullRematerialization(): void {
        this.bundledDevelopment.handleHmrOutput = (_client, _files, update) => {
            // DevEngine already creates complete output for FullReload. A Patch normally creates only its native update
            // program, so Phase 1 upgrades that case explicitly instead of publishing the patch.
            if (update.type !== 'Patch' || this.phase !== 'ready') return

            this.rebuildTail = this.rebuildTail
                .then(async () => {
                    if (this.phase === 'closed') return
                    const engine = this.requireEngine()
                    engine.triggerFullBuild()
                    await engine.ensureLatestBuildOutput()
                    await this.materializer.waitForIdle()
                })
                .catch((error: unknown) => {
                    if (this.phase === 'closed') return
                    const normalizedError = error instanceof Error ? error : new Error(String(error))
                    this.server.config.logger.error('[vite-plugin-taro] wx rematerialization failed', {
                        error: normalizedError
                    })
                })
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
            if (!this.initialWrite) {
                throw new Error('The initial wx bundled-development build produced no app.js output.')
            }

            this.registerBundleModules()
            await this.initialWrite
            await this.materializer.waitForIdle()
            this.phase = 'ready'
            this.server.config.logger.info(`[vite-plugin-taro] wx project materialized at ${this.materializer.outDir}`)
        }
    }

    private collectBundleModules(output: WxDevelopmentOutput): void {
        for (const file of output) {
            if (file.type !== 'chunk') continue
            for (const moduleId of file.moduleIds) {
                this.bundledModules.add(toStableModuleId(moduleId, this.server.config.root))
            }
        }
    }

    private registerBundleModules(): void {
        this.requireEngine().registerModules(clientId, [...this.bundledModules])
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

function toStableModuleId(moduleId: string, root: string): string {
    const normalizedId = moduleId.replaceAll('\\', '/')
    const normalizedRoot = root.replaceAll('\\', '/')
    if (normalizedId.startsWith('\0') || !path.posix.isAbsolute(normalizedId)) return normalizedId
    return path.posix.relative(normalizedRoot, normalizedId)
}
