import type { ResolvedConfig, ViteDevServer } from 'vite'
import { wxDevRuntimeImplementation } from './dev-runtime-source.ts'
import type { WxOutputFile } from './output.ts'

const clientId = 'vite-plugin-taro-wx'

export type WxHmrBoundary = {
    boundary: string
    acceptedVia: string
}

export type WxHmrOutput =
    | { type: 'Noop' }
    | { type: 'FullReload'; reason?: string }
    | {
          type: 'Patch'
          code: string
          filename: string
          hmrBoundaries: WxHmrBoundary[]
      }

type WxDevEngineInternal = {
    registerModules(clientId: string, modules: string[]): void
    ensureCurrentBuildFinish(): Promise<void>
    ensureLatestBuildOutput(): Promise<unknown>
    getBundleState(): Promise<{ lastBuildErrored: boolean }>
    triggerFullBuild(): void
}

type WxRolldownOptions = {
    output?: Record<string, unknown> | Array<Record<string, unknown>>
    experimental?: {
        devMode?: boolean | Record<string, unknown>
        [key: string]: unknown
    }
    [key: string]: unknown
}

type WxHotClient = {
    send(payload: unknown): void
}

type WxBundledDevInternal = {
    _devEngine?: WxDevEngineInternal
    clients: {
        setupIfNeeded(client: WxHotClient, clientId: string): void
    }
    getRolldownOptions(): Promise<WxRolldownOptions>
    storeOutputFiles(output: WxOutputFile[]): void
    handleHmrOutput(client: WxHotClient, files: string[], output: WxHmrOutput, info?: unknown): void
    listen(): Promise<void>
}

type WxBundledDevCallbacks = {
    onOutput(output: WxOutputFile[]): void
    onPatch(files: string[], output: WxHmrOutput): boolean
    onError(message: string): void
    waitUntilReady(): Promise<void>
}

/** Isolates the private Vite bundled-development API used by the WX session. */
export class WxBundledDevAdapter {
    private bundledDev: WxBundledDevInternal | undefined

    constructor(
        private readonly config: ResolvedConfig,
        private readonly server: ViteDevServer,
        private readonly callbacks: WxBundledDevCallbacks
    ) {}

    install(): void {
        const bundledDev = this.server.environments.client.bundledDev as unknown as WxBundledDevInternal | undefined
        if (!bundledDev) throw new Error('vite-plugin-taro requires Vite bundled development for WX development.')
        if (
            typeof bundledDev.getRolldownOptions !== 'function' ||
            typeof bundledDev.storeOutputFiles !== 'function' ||
            typeof bundledDev.handleHmrOutput !== 'function'
        ) {
            throw new Error('vite-plugin-taro does not support this Vite bundled-development API shape.')
        }
        this.bundledDev = bundledDev
        this.installOptions(bundledDev)
        this.installOutput(bundledDev)
        this.installPatches(bundledDev)
        this.installListener(bundledDev)
    }

    registerModules(moduleIds: string[]): void {
        if (moduleIds.length) this.bundledDev?._devEngine?.registerModules(clientId, moduleIds)
    }

    async rebuild(): Promise<void> {
        const engine = this.bundledDev?._devEngine
        if (!engine) return
        engine.triggerFullBuild()
        await engine.ensureLatestBuildOutput()
    }

    private installOptions(bundledDev: WxBundledDevInternal): void {
        const getRolldownOptions = bundledDev.getRolldownOptions.bind(bundledDev)
        bundledDev.getRolldownOptions = async () => {
            const options = await getRolldownOptions()
            if (!options.output) options.output = {}
            const output = getFirstOutput(options)
            const configuredOutput = this.config.build.rolldownOptions.output
            const desiredOutput = Array.isArray(configuredOutput) ? configuredOutput[0] : configuredOutput
            Object.assign(output, desiredOutput, {
                format: 'cjs',
                sourcemap: false,
                minify: false,
                banner: createPageBanner
            })
            options.experimental ??= {}
            options.experimental.devMode = {
                ...(typeof options.experimental.devMode === 'object' ? options.experimental.devMode : {}),
                lazy: false,
                implement: wxDevRuntimeImplementation
            }
            return options
        }
    }

    private installOutput(bundledDev: WxBundledDevInternal): void {
        const storeOutputFiles = bundledDev.storeOutputFiles.bind(bundledDev)
        bundledDev.storeOutputFiles = (output) => {
            storeOutputFiles(output)
            this.callbacks.onOutput(output)
        }
    }

    private installPatches(bundledDev: WxBundledDevInternal): void {
        const handleHmrOutput = bundledDev.handleHmrOutput.bind(bundledDev)
        bundledDev.handleHmrOutput = (client, files, output, info) => {
            if (output.type === 'Noop') return
            if (this.callbacks.onPatch(files, output)) handleHmrOutput(client, files, output, info)
        }
    }

    private installListener(bundledDev: WxBundledDevInternal): void {
        const listen = bundledDev.listen.bind(bundledDev)
        bundledDev.listen = async () => {
            await listen()
            bundledDev.clients.setupIfNeeded({ send: (payload) => this.handlePayload(payload) }, clientId)
            const engine = bundledDev._devEngine
            if (!engine) throw new Error('vite-plugin-taro expected Vite to initialize the WX DevEngine.')
            await engine.ensureCurrentBuildFinish()
            if ((await engine.getBundleState()).lastBuildErrored) {
                throw new Error('The initial WX bundled-development build failed.')
            }
            await this.callbacks.waitUntilReady()
        }
    }

    private handlePayload(payload: unknown): void {
        if (typeof payload !== 'object' || payload === null) return
        const candidate = payload as { type?: unknown; err?: { message?: unknown } }
        if (candidate.type === 'error' && typeof candidate.err?.message === 'string') {
            this.callbacks.onError(candidate.err.message)
        }
    }
}

function getFirstOutput(options: WxRolldownOptions): Record<string, unknown> {
    if (!Array.isArray(options.output)) return options.output as Record<string, unknown>
    const output = options.output[0] ?? {}
    options.output[0] = output
    return output
}

function createPageBanner(chunk: { fileName: string }): string {
    if (!chunk.fileName.startsWith('pages/') || !chunk.fileName.endsWith('.js')) return ''
    const prefix = '../'.repeat(chunk.fileName.split('/').length - 1)
    return `require(${JSON.stringify(`${prefix}runtime.js`)}); require(${JSON.stringify(`${prefix}__wx_hmr__/update.js`)});`
}
