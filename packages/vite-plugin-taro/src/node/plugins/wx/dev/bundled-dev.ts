import path from 'node:path'
import type { ViteDevServer } from 'vite'
import {
    controlFileName,
    initializeWxDevelopmentOutput,
    syncWxPublicFile,
    updateFileName,
    type WxDevelopmentOutput,
    writeWxDevelopmentOutput
} from './output.ts'

const rolldownRuntimeBinding = 'const __rolldown_runtime__ = global.__rolldown_runtime__;'

type DevelopmentEngine = {
    ensureCurrentBuildFinish(): Promise<void>
    ensureLatestBuildOutput(): Promise<unknown>
    getBundleState(): Promise<{ lastBuildErrored: boolean }>
    triggerFullBuild(): void
}

type DevelopmentRolldownOptions = {
    output?: Record<string, unknown>
    experimental?: {
        devMode?: boolean | Record<string, unknown>
        [key: string]: unknown
    }
    [key: string]: unknown
}

type BundledDevelopment = {
    _devEngine?: DevelopmentEngine
    getRolldownOptions(): Promise<DevelopmentRolldownOptions>
    storeOutputFiles(output: WxDevelopmentOutput): void
    listen(): Promise<void>
}

type OutputAddon = string | ((chunk: { fileName: string }) => string | Promise<string>)
type StartingState = Readonly<{
    status: 'starting'
    writes: Promise<void>
    initialWrite?: Promise<void>
}>
type ReadyState = Readonly<{
    status: 'ready'
    writes: Promise<void>
    rebuild?: Promise<void>
    rebuildAgain: boolean
}>
type ClosedState = Readonly<{
    status: 'closed'
    done: Promise<void>
}>
type DevelopmentState = StartingState | ReadyState | ClosedState

/**
 * Minimal host implementation used while source updates deliberately rematerialize the complete physical project.
 * Rolldown injects this self-contained source into its generated helper runtime.
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

/** Installs the pinned Vite bundled-development adapter. */
export function installWxBundledDevelopment({
    server,
    pagePaths
}: {
    server: ViteDevServer
    pagePaths: readonly string[]
}): { close(): Promise<void> } {
    const bundledDevelopment = server.environments.client.bundledDev as unknown as BundledDevelopment | undefined
    if (!bundledDevelopment) throw new Error('Vite did not create the wx bundled-development environment.')

    const session = new WxBundledDevelopment(server, bundledDevelopment, pagePaths)
    session.install()
    return session
}

/** Owns the complete development lifecycle as one immutable state value. */
class WxBundledDevelopment {
    private readonly server: ViteDevServer
    private readonly bundledDevelopment: BundledDevelopment
    private readonly outDir: string
    private readonly publicDir: string
    private readonly pageFiles: ReadonlySet<string>
    private state: DevelopmentState
    private readonly handleWatcherEvent = (event: string, filePath: string): void => {
        const publicDestination = this.getPublicDestination(filePath)
        if (publicDestination) {
            this.queuePublicFile(event, filePath, publicDestination)
            return
        }
        if (!isInside(this.outDir, filePath) && (event === 'add' || event === 'change' || event === 'unlink')) {
            this.requestRebuild()
        }
    }

    constructor(server: ViteDevServer, bundledDevelopment: BundledDevelopment, pagePaths: readonly string[]) {
        this.server = server
        this.bundledDevelopment = bundledDevelopment
        this.outDir = path.resolve(server.config.root, server.config.build.outDir)
        this.publicDir = server.config.publicDir ? path.resolve(server.config.publicDir) : ''
        this.pageFiles = new Set(pagePaths.map((pagePath) => `${pagePath}.js`))
        this.state = {
            status: 'starting',
            writes: initializeWxDevelopmentOutput({
                outDir: this.outDir,
                publicDir: this.publicDir,
                emptyOutDir: server.config.build.emptyOutDir !== false
            })
        }
    }

    install(): void {
        this.installRolldownOptions()
        this.installOutputWriter()
        this.installInitialBuildBarrier()
        this.server.watcher.add(this.server.config.root)
        this.server.watcher.on('all', this.handleWatcherEvent)
    }

    async close(): Promise<void> {
        const current = this.state
        if (current.status === 'closed') return current.done

        this.server.watcher.off('all', this.handleWatcherEvent)
        const done =
            current.status === 'ready' && current.rebuild
                ? Promise.all([current.writes, current.rebuild]).then(() => undefined)
                : current.writes
        this.state = { status: 'closed', done }
        await this.server.watcher.unwatch(this.server.config.root)
        await done
    }

    private installRolldownOptions(): void {
        const getRolldownOptions = this.bundledDevelopment.getRolldownOptions.bind(this.bundledDevelopment)

        this.bundledDevelopment.getRolldownOptions = async () => {
            const rolldownOptions = await getRolldownOptions()
            if (Array.isArray(rolldownOptions.output)) throw new Error('wx development supports one Rolldown output.')
            rolldownOptions.output ??= {}
            const output = rolldownOptions.output
            const configuredOutput = this.server.config.build.rolldownOptions.output
            if (Array.isArray(configuredOutput)) throw new Error('wx development supports one configured output.')
            const configured = (configuredOutput ?? {}) as Record<string, unknown>
            const configuredBanner = configured.banner as OutputAddon | undefined

            Object.assign(output, configured, {
                format: 'es',
                minify: false,
                sourcemap: true,
                entryFileNames: createStableFileNames(configured.entryFileNames, '[name]'),
                chunkFileNames: createStableFileNames(configured.chunkFileNames, 'assets/[name].js'),
                assetFileNames: createStableFileNames(configured.assetFileNames, 'assets/[name][extname]'),
                banner: createDevelopmentBanner(configuredBanner, this.pageFiles)
            })

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

    private installOutputWriter(): void {
        const storeOutputFiles = this.bundledDevelopment.storeOutputFiles.bind(this.bundledDevelopment)

        this.bundledDevelopment.storeOutputFiles = (output) => {
            storeOutputFiles(output)
            const current = this.state
            if (current.status === 'closed') return

            const write = writeWxDevelopmentOutput({ outDir: this.outDir, output, previousWrite: current.writes })
            const writes = write.done.catch((error: unknown) => this.reportError('output write', error))
            this.state =
                current.status === 'starting'
                    ? {
                          ...current,
                          writes,
                          initialWrite: current.initialWrite ?? (write.complete ? write.done : undefined)
                      }
                    : { ...current, writes }
        }
    }

    private installInitialBuildBarrier(): void {
        const listen = this.bundledDevelopment.listen.bind(this.bundledDevelopment)

        this.bundledDevelopment.listen = async () => {
            await listen()
            const engine = this.requireEngine()
            await engine.ensureCurrentBuildFinish()

            if ((await engine.getBundleState()).lastBuildErrored) {
                throw new Error('The initial wx bundled-development build failed.')
            }
            if (this.state.status !== 'starting' || !this.state.initialWrite) {
                throw new Error('The initial wx bundled-development build produced no app.js output.')
            }

            await this.state.initialWrite
            await engine.ensureLatestBuildOutput()
            if (this.state.status !== 'starting') return
            await this.state.writes
            this.state = { status: 'ready', writes: this.state.writes, rebuildAgain: false }
            this.server.config.logger.info(`[vite-plugin-taro] wx project materialized at ${this.outDir}`)
        }
    }

    private requestRebuild(): void {
        const current = this.state
        if (current.status !== 'ready') return
        if (current.rebuild) {
            this.state = { ...current, rebuildAgain: true }
            return
        }

        const rebuild = this.rebuild().catch((error: unknown) => this.reportError('rematerialization', error))
        this.state = { ...current, rebuild, rebuildAgain: false }
        void rebuild.then(() => this.finishRebuild(rebuild))
    }

    private async rebuild(): Promise<void> {
        const engine = this.requireEngine()
        engine.triggerFullBuild()
        await engine.ensureLatestBuildOutput()
        if (this.state.status !== 'closed') await this.state.writes
    }

    private finishRebuild(rebuild: Promise<void>): void {
        const current = this.state
        if (current.status !== 'ready' || current.rebuild !== rebuild) return

        const rebuildAgain = current.rebuildAgain
        this.state = { status: 'ready', writes: current.writes, rebuildAgain: false }
        if (rebuildAgain) this.requestRebuild()
    }

    private queuePublicFile(event: string, sourcePath: string, destinationPath: string): void {
        const current = this.state
        if (current.status === 'closed') return

        const write = current.writes.then(() => syncWxPublicFile(event, sourcePath, destinationPath))
        const writes = write.catch((error: unknown) => this.reportError('public file sync', error))
        this.state = { ...current, writes }
    }

    private getPublicDestination(filePath: string): string | undefined {
        if (!this.publicDir) return
        const relativePath = path.relative(this.publicDir, filePath)
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) return
        return path.join(this.outDir, relativePath)
    }

    private reportError(operation: string, error: unknown): void {
        if (this.state.status === 'closed') return
        const normalizedError = error instanceof Error ? error : new Error(String(error))
        this.server.config.logger.error(`[vite-plugin-taro] wx ${operation} failed`, { error: normalizedError })
    }

    private requireEngine(): DevelopmentEngine {
        const engine = this.bundledDevelopment._devEngine
        if (!engine) throw new Error('Vite did not initialize the wx DevEngine.')
        return engine
    }
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

function createNativeDevelopmentDependency(fileName: string, pageFiles: ReadonlySet<string>): string {
    if (fileName === 'app.js') return `require(${JSON.stringify(`./${controlFileName}`)});`
    if (!pageFiles.has(fileName)) return ''

    const root = '../'.repeat(fileName.split('/').length - 1)
    return `require(${JSON.stringify(`${root}${updateFileName}`)});`
}

function createStableFileNames<T>(addon: unknown, fallback: string): string | ((value: T) => string) {
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

function isInside(directory: string, filePath: string): boolean {
    const relativePath = path.relative(directory, filePath)
    return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}
