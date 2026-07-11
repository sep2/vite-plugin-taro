import { existsSync, type FSWatcher, watch } from 'node:fs'
import path from 'node:path'
import type { ResolvedConfig, ViteDevServer } from 'vite'
import { transformWxRuntimeClassNames } from '../vite/taro-css.ts'
import { type WxOutputFile, WxOutputWriter } from './output-writer.ts'
import { WxPatchJournal } from './patch-journal.ts'
import { wxDevRuntimeImplementation } from './runtime-implementation.ts'

const clientId = 'vite-plugin-taro-wx'
const maxPatchCount = 1_000
const maxPatchBytes = 16 * 1024 * 1024

type WxHmrBoundary = {
    boundary: string
    acceptedVia: string
}

type WxHmrOutput =
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

type WxHotClient = {
    send(payload: unknown): void
}

/** Owns one WX bundled-development graph and all writes to its fixed output directory. */
export class WxDevelopmentSession {
    private readonly journal: WxPatchJournal
    private readonly outputWriter: WxOutputWriter
    private readonly initialOutput: Promise<void>
    private resolveInitialOutput!: () => void
    private rejectInitialOutput!: (error: unknown) => void
    private work = Promise.resolve()
    private readonly fallbackWatchers: FSWatcher[] = []
    private fallbackBuildUntil = 0
    private buildErrored = false
    private fullBuildPending = false
    private lastFullBuildAt = 0
    private latestWxss = ''
    private closed = false
    private bundledDev: WxBundledDevInternal | undefined

    constructor(
        private readonly config: ResolvedConfig,
        private readonly server: ViteDevServer
    ) {
        const outDir = path.resolve(config.root, config.build.outDir)
        this.journal = new WxPatchJournal(outDir)
        this.outputWriter = new WxOutputWriter(outDir)
        this.initialOutput = new Promise<void>((resolve, reject) => {
            this.resolveInitialOutput = resolve
            this.rejectInitialOutput = reject
        })
    }

    install(): void {
        const environment = this.server.environments.client
        const bundledDev = environment.bundledDev as unknown as WxBundledDevInternal | undefined
        if (!bundledDev) {
            throw new Error('vite-plugin-taro requires Vite bundled development for the WX development server.')
        }
        if (
            typeof bundledDev.getRolldownOptions !== 'function' ||
            typeof bundledDev.storeOutputFiles !== 'function' ||
            typeof bundledDev.handleHmrOutput !== 'function'
        ) {
            throw new Error('vite-plugin-taro does not support this Vite bundled-development API shape.')
        }
        this.bundledDev = bundledDev
        this.installOptionsAdapter(bundledDev)
        this.installOutputAdapter(bundledDev)
        this.installPatchAdapter(bundledDev)
        this.installListenerAdapter(bundledDev)
        this.watchFallbackFiles(path.join(this.config.root, 'src'), false)
        if (this.config.publicDir) this.watchFallbackFiles(this.config.publicDir, true)
    }

    async close(): Promise<void> {
        if (this.closed) return
        this.closed = true
        for (const watcher of this.fallbackWatchers) watcher.close()
        await this.work
        await this.journal.close()
    }

    private watchFallbackFiles(directory: string, allFiles: boolean): void {
        if (!existsSync(directory)) return
        this.fallbackWatchers.push(
            watch(directory, { recursive: true }, (_, fileName) => {
                if (!fileName || isTemporaryFile(fileName)) return
                if (/\.[cm]?[jt]sx?$/.test(fileName)) {
                    if (this.buildErrored) {
                        this.fallbackBuildUntil = Date.now() + 2_000
                        this.requestFullBuild()
                    }
                    return
                }
                if (!allFiles && !isWxFallbackSource(fileName)) return
                this.fallbackBuildUntil = Date.now() + 2_000
                this.requestFullBuild()
            })
        )
    }

    private handleHotPayload(payload: unknown): void {
        if (!isErrorPayload(payload)) return
        this.buildErrored = true
        const error = new Error(payload.err.message)
        this.server.config.logger.error('[vite-plugin-taro] WX update failed', { error })
    }

    requestFullBuild(): void {
        if (this.fullBuildPending || this.closed || Date.now() - this.lastFullBuildAt < 500) return
        const engine = this.bundledDev?._devEngine
        if (!engine) return
        this.fullBuildPending = true
        engine.triggerFullBuild()
        void engine.ensureLatestBuildOutput().catch(() => {
            this.fullBuildPending = false
        })
    }

    private installOptionsAdapter(bundledDev: WxBundledDevInternal): void {
        const getRolldownOptions = bundledDev.getRolldownOptions.bind(bundledDev)
        bundledDev.getRolldownOptions = async () => {
            const options = await getRolldownOptions()
            if (!options.output) options.output = {}
            let output: Record<string, unknown>
            if (Array.isArray(options.output)) {
                output = options.output[0] ?? {}
                options.output[0] = output
            } else {
                output = options.output
            }
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

    private installOutputAdapter(bundledDev: WxBundledDevInternal): void {
        const storeOutputFiles = bundledDev.storeOutputFiles.bind(bundledDev)
        bundledDev.storeOutputFiles = (output) => {
            const wxss = normalizeWxStyles(output)
            if (wxss !== undefined) this.latestWxss = wxss
            if (isFullOutput(output)) {
                if (this.latestWxss) setAppWxss(output, this.latestWxss)
                stampFullOutput(output)
            }
            storeOutputFiles(output)
            if (!isFullOutput(output)) {
                this.enqueue(() => this.outputWriter.writeOutput(output))
                return
            }
            if (Date.now() - this.lastFullBuildAt < 1_000) {
                this.enqueue(() => this.outputWriter.writeOutput(output))
                return
            }
            const moduleIds = collectInitialModuleIds(output, this.config.root)
            this.buildErrored = false
            this.fullBuildPending = false
            this.lastFullBuildAt = Date.now()
            this.enqueue(async () => {
                await this.outputWriter.writeFullOutput(output)
                await this.journal.reset()
                bundledDev._devEngine?.registerModules(clientId, moduleIds)
                this.resolveInitialOutput()
                this.server.config.logger.info(
                    `[vite-plugin-taro] WX bundle ready (${moduleIds.length} modules, ${output.length} files)`
                )
            })
        }
    }

    private installPatchAdapter(bundledDev: WxBundledDevInternal): void {
        const handleHmrOutput = bundledDev.handleHmrOutput.bind(bundledDev)
        bundledDev.handleHmrOutput = (client, files, output, info) => {
            if (output.type === 'Noop') return
            if (output.type === 'FullReload' || !isSafeJavaScriptPatch(files, output)) {
                if (Date.now() >= this.fallbackBuildUntil) this.requestFullBuild()
                return
            }

            const moduleIds = collectPatchModuleIds(output.code)
            if (moduleIds.length) bundledDev._devEngine?.registerModules(clientId, moduleIds)
            this.enqueue(async () => {
                const transformed = await transformWxRuntimeClassNames(this.config.root, output.code, output.filename)
                await this.journal.append(transformed.code)
                if (this.journal.length >= maxPatchCount || this.journal.size >= maxPatchBytes) {
                    this.requestFullBuild()
                }
            })
            handleHmrOutput(client, files, output, info)
        }
    }

    private installListenerAdapter(bundledDev: WxBundledDevInternal): void {
        const listen = bundledDev.listen.bind(bundledDev)
        bundledDev.listen = async () => {
            await listen()
            const client: WxHotClient = { send: (payload) => this.handleHotPayload(payload) }
            bundledDev.clients.setupIfNeeded(client, clientId)
            const engine = bundledDev._devEngine
            if (!engine) throw new Error('vite-plugin-taro expected Vite to initialize the WX DevEngine.')
            await engine.ensureCurrentBuildFinish()
            const state = await engine.getBundleState()
            if (state.lastBuildErrored) {
                const error = new Error('The initial WX bundled-development build failed.')
                this.rejectInitialOutput(error)
                throw error
            }
            await this.initialOutput
            await this.work
        }
    }

    private enqueue(task: () => Promise<void>): void {
        this.work = this.work.then(task).catch((error: unknown) => {
            const normalizedError = error instanceof Error ? error : new Error(String(error))
            this.server.config.logger.error('[vite-plugin-taro] WX development output failed', {
                error: normalizedError
            })
        })
    }
}

function isTemporaryFile(fileName: string): boolean {
    const baseName = path.basename(fileName)
    return (
        baseName.startsWith('.~') ||
        baseName.startsWith('.#') ||
        baseName.endsWith('~') ||
        /\.(?:tmp|swp|swx)$/.test(baseName) ||
        baseName.includes('___jb_')
    )
}

function isWxFallbackSource(fileName: string): boolean {
    return /\.(?:css|scss|sass|less|styl|stylus|json|wxml|wxs|png|jpe?g|gif|webp|svg|ico|bmp|avif|woff2?|ttf|otf|eot|mp3|mp4|wav|ogg|webm)$/i.test(
        fileName
    )
}

function isErrorPayload(payload: unknown): payload is { type: 'error'; err: { message: string } } {
    if (typeof payload !== 'object' || payload === null) return false
    const candidate = payload as { type?: unknown; err?: { message?: unknown } }
    return candidate.type === 'error' && typeof candidate.err?.message === 'string'
}

function createPageBanner(chunk: { fileName: string }): string {
    if (!chunk.fileName.startsWith('pages/') || !chunk.fileName.endsWith('.js')) return ''
    const depth = chunk.fileName.split('/').length - 1
    const prefix = '../'.repeat(depth)
    return `require(${JSON.stringify(`${prefix}runtime.js`)}); require(${JSON.stringify(`${prefix}__wx_hmr__/update.js`)});`
}

function stampFullOutput(output: WxOutputFile[]): void {
    const index = output.findIndex((item) => item.type === 'chunk' && item.fileName === 'app.js')
    if (index < 0) return
    const app = output[index]
    if (app?.type !== 'chunk') return
    output[index] = {
        type: 'chunk',
        fileName: app.fileName,
        modules: app.modules,
        code: `${app.code}\n;globalThis.__WX_FULL_BUILD__ = ${Date.now()};\n`
    }
}

function normalizeWxStyles(output: WxOutputFile[]): string | undefined {
    const styles: string[] = []
    for (let index = output.length - 1; index >= 0; index--) {
        const item = output[index]
        if (!item) continue
        if (item.type === 'asset' && item.fileName.endsWith('.css')) {
            styles.unshift(typeof item.source === 'string' ? item.source : new TextDecoder().decode(item.source))
            output.splice(index, 1)
            continue
        }
        if (item.type === 'chunk') styles.push(...collectChunkStyles(item.code))
    }
    if (styles.length === 0) return
    const source = styles.join('\n')
    setAppWxss(output, source)
    return source
}

function collectChunkStyles(code: string): string[] {
    const styles: string[] = []
    for (const match of code.matchAll(/__vite__css(?:\$\d+)?\s*=\s*("(?:\\.|[^"\\])*");/g)) {
        if (match[1]) styles.push(JSON.parse(match[1]) as string)
    }
    return styles
}

function setAppWxss(output: WxOutputFile[], source: string): void {
    const index = output.findIndex((item) => item.type === 'asset' && item.fileName === 'app.wxss')
    const appStyle: WxOutputFile = { type: 'asset', fileName: 'app.wxss', source }
    if (index >= 0) output[index] = appStyle
    else output.push(appStyle)
}

function isFullOutput(output: WxOutputFile[]): boolean {
    return output.some((item) => item.fileName === 'app.js')
}

function isSafeJavaScriptPatch(
    files: string[],
    output: WxHmrOutput
): output is Extract<WxHmrOutput, { type: 'Patch' }> {
    if (output.type !== 'Patch' || output.hmrBoundaries.length === 0) return false
    if (output.code.includes('__vite__updateStyle') || output.code.includes('.updateStyle(')) return false
    return files.every((file) => /\.[cm]?[jt]sx?$/.test(file))
}

function collectInitialModuleIds(output: WxOutputFile[], root: string): string[] {
    const ids = new Set<string>()
    for (const item of output) {
        if (item.type !== 'chunk') continue
        for (const id of Object.keys(item.modules ?? {})) ids.add(toStableModuleId(id, root))
    }
    return [...ids]
}

function toStableModuleId(id: string, root: string): string {
    const normalizedId = id.replace(/\\/g, '/')
    if (normalizedId.startsWith('\0') || !path.posix.isAbsolute(normalizedId)) return normalizedId
    return path.posix.relative(root.replace(/\\/g, '/'), normalizedId)
}

function collectPatchModuleIds(code: string): string[] {
    const ids = new Set<string>()
    for (const match of code.matchAll(/create(?:Esm|Cjs)Initializer\("([^"]+)"/g)) ids.add(match[1])
    return [...ids]
}
