/**
 * Top-level owner of one WX development lifecycle.
 *
 * It serializes every output write, connects DevEngine patches to the update transport, and coalesces conservative full
 * rebuilds. No other module writes plugin-generated WX development files directly.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import colors from 'picocolors'
import type { ViteDevServer } from 'vite'
import type { BuildContext } from '../../../build-context.ts'
import { SerializedTaskQueue } from '../../../utils/async.ts'
import {
    copyDirectoryIfExists,
    copyFileOrRemove,
    writeFileAtomically,
    writeFilesAtomically
} from '../../../utils/filesystem.ts'
import { wxDevelopmentDirectory, wxUpdateControlFile, wxUpdateFile } from '../development-files.ts'
import { FullBuildScheduler } from './development-coordination.ts'
import {
    isWxFullBuildOutput,
    normalizeWxBundleStyles,
    setWxAppStyles,
    type WxOutputFile
} from './development-output.ts'
import { transformWxCompatibleJavaScript, transformWxOutputChunks } from './javascript-compatibility.ts'
import { WxUpdateTransport } from './update-transport.ts'
import { ViteBundledDevAdapter, type WxDevEngineUpdate } from './vite-bundled-dev-adapter.ts'

const maxRetainedDeltaCount = 1_000
const maxRetainedDeltaBytes = 16 * 1024 * 1024
const fullBuildDebounceDelay = 100

type WxDevServerContext = Pick<BuildContext, 'vite' | 'css'>
type SessionSnapshot = Readonly<{
    lifecycle: 'open' | 'closed'
    outputPhase: 'starting' | 'ready'
    latestAppStyles: string
}>

/** Owns one WX bundled-development graph and all writes to its fixed output directory. */
export class WxDevelopmentSession {
    private readonly adapter: ViteBundledDevAdapter
    private readonly updateTransport: WxUpdateTransport
    private readonly outDir: string
    private readonly initialBundle = Promise.withResolvers<void>()
    private readonly outputQueue: SerializedTaskQueue
    private readonly fullBuildScheduler: FullBuildScheduler
    private originalPrintUrls: (() => void) | undefined
    private snapshot: SessionSnapshot = { lifecycle: 'open', outputPhase: 'starting', latestAppStyles: '' }

    constructor(
        private readonly context: WxDevServerContext,
        private readonly server: ViteDevServer
    ) {
        const config = context.vite
        this.outDir = path.resolve(config.root, config.build.outDir)
        this.outputQueue = new SerializedTaskQueue((error) => this.reportOutputError(error))
        this.updateTransport = new WxUpdateTransport(
            server,
            () => this.requestFullBuild(),
            (buildId, source) =>
                this.outputQueue.enqueue(async () => {
                    // A full build queued before this write invalidates the old batch instead of letting it overwrite
                    // the new build's empty update.js.
                    if (!this.updateTransport.isCurrentBuild(buildId)) return
                    await writeFileAtomically(path.join(this.outDir, wxUpdateFile), source)
                })
        )
        this.adapter = new ViteBundledDevAdapter(config, server, {
            onOutput: (output) => this.handleBundleOutput(output),
            onPatch: (files, output) => this.handlePatch(files, output),
            onError: (message) => this.handleError(message),
            waitForInitialBundle: () => this.waitForInitialBundle()
        })
        this.fullBuildScheduler = new FullBuildScheduler(
            fullBuildDebounceDelay,
            () => this.adapter.rebuild(),
            (error) => this.reportRebuildError(error)
        )
    }

    private get config() {
        return this.context.vite
    }

    install(): void {
        this.updateTransport.install()
        this.server.httpServer?.once('listening', this.handleHttpListening)
        this.adapter.install()
        this.originalPrintUrls = this.server.printUrls.bind(this.server)
        this.server.printUrls = this.printUrls
        if (this.config.publicDir) this.server.watcher.add(this.config.publicDir)
        this.server.watcher.on('change', this.handleWatchedFile)
        this.server.watcher.on('add', this.handleWatchedFile)
        this.server.watcher.on('unlink', this.handleWatchedFile)
    }

    async close(): Promise<void> {
        if (this.snapshot.lifecycle === 'closed') return
        this.snapshot = { ...this.snapshot, lifecycle: 'closed' }
        this.server.watcher.off('change', this.handleWatchedFile)
        this.server.watcher.off('add', this.handleWatchedFile)
        this.server.watcher.off('unlink', this.handleWatchedFile)
        this.server.httpServer?.off('listening', this.handleHttpListening)
        if (this.server.printUrls === this.printUrls && this.originalPrintUrls) {
            this.server.printUrls = this.originalPrintUrls
        }
        this.updateTransport.close()
        await this.fullBuildScheduler.close()
        await this.outputQueue.waitForIdle()
    }

    private readonly printUrls = (): void => {
        this.originalPrintUrls?.()
        const projectDirectory = relativeToViteConfig(this.outDir, this.config.configFile, this.config.root)
        this.server.config.logger.info(
            `  ${colors.green('➜')}  ${colors.bold('WeChat DevTools')}: ${colors.cyan(projectDirectory)}`
        )
    }

    private readonly handleHttpListening = (): void => {
        this.outputQueue.enqueue(() =>
            writeFileAtomically(path.join(this.outDir, wxUpdateControlFile), this.updateTransport.createControlSource())
        )
    }

    private readonly handleWatchedFile = (file: string): void => {
        if (isFileInside(file, this.config.publicDir)) {
            const destination = path.join(this.outDir, path.relative(this.config.publicDir, file))
            this.outputQueue.enqueue(() => copyFileOrRemove(file, destination))
            this.requestFullBuild()
        }
    }

    private handleBundleOutput(output: WxOutputFile[]): void {
        const appStyles = normalizeWxBundleStyles(output)
        if (appStyles !== undefined) this.snapshot = { ...this.snapshot, latestAppStyles: appStyles }
        if (isWxFullBuildOutput(output) && this.snapshot.latestAppStyles) {
            setWxAppStyles(output, this.snapshot.latestAppStyles)
        }

        if (!isWxFullBuildOutput(output)) {
            this.outputQueue.enqueue(async () => {
                await transformWxOutputChunks(output)
                await writeDevelopmentOutput(this.outDir, output)
            })
            return
        }

        const buildId = this.updateTransport.createBuildId()
        setDevelopmentAsset(output, wxUpdateControlFile, this.updateTransport.createControlSource(buildId))
        setDevelopmentAsset(output, wxUpdateFile, 'void 0;\n')
        this.outputQueue.enqueue(async () => {
            await transformWxOutputChunks(output)
            if (this.snapshot.outputPhase === 'starting') {
                // The directory is plugin-owned; clearing it once removes stale files from previous protocol designs.
                await fs.rm(path.join(this.outDir, wxDevelopmentDirectory), { recursive: true, force: true })
            }
            // Invalidate old HTTP reports before writing the new build epoch into the fixed DevTools directory.
            this.updateTransport.commitFullBuild(buildId)
            await writeDevelopmentOutput(this.outDir, output)
            await copyDirectoryIfExists(this.config.publicDir, this.outDir)
            const moduleCount = this.adapter.registerBundleModules(output)
            this.snapshot = { ...this.snapshot, outputPhase: 'ready' }
            this.initialBundle.resolve()
            this.server.config.logger.info(
                `[vite-plugin-taro] WX bundle ready (${moduleCount} modules, ${output.length} files)`
            )
        })
    }

    private handlePatch(files: string[], output: WxDevEngineUpdate): boolean {
        if (!isSafeJavaScriptPatch(files, output)) {
            this.requestFullBuild()
            return false
        }

        this.adapter.registerPatchModules(output.code)
        this.outputQueue.enqueue(async () => {
            const transformed = await this.context.css.transformWxClassNames(output.code, output.filename)
            const compatibleCode = await transformWxCompatibleJavaScript(transformed.code, output.filename)
            if (
                this.updateTransport.retainedDeltaCount >= maxRetainedDeltaCount ||
                this.updateTransport.retainedDeltaBytes + Buffer.byteLength(compatibleCode) >= maxRetainedDeltaBytes
            ) {
                this.requestFullBuild()
                return
            }
            this.updateTransport.addDelta(compatibleCode)
        })
        return true
    }

    private handleError(message: string): void {
        this.server.config.logger.error('[vite-plugin-taro] WX update failed', { error: new Error(message) })
    }

    private requestFullBuild(): void {
        this.fullBuildScheduler.request()
    }

    private async waitForInitialBundle(): Promise<void> {
        await this.initialBundle.promise
        await this.outputQueue.waitForIdle()
    }

    private reportOutputError(error: unknown): void {
        const normalizedError = error instanceof Error ? error : new Error(String(error))
        this.server.config.logger.error(
            `[vite-plugin-taro] WX development output failed: ${normalizedError.stack ?? normalizedError.message}`
        )
    }

    private reportRebuildError(error: unknown): void {
        const normalizedError = error instanceof Error ? error : new Error(String(error))
        this.server.config.logger.error('[vite-plugin-taro] WX rebuild failed', { error: normalizedError })
    }
}

function writeDevelopmentOutput(outDir: string, output: WxOutputFile[]): Promise<void> {
    return writeFilesAtomically(
        output.map((item) => ({
            file: path.join(outDir, item.fileName),
            source: item.type === 'chunk' ? item.code : item.source
        }))
    )
}

function setDevelopmentAsset(output: WxOutputFile[], fileName: string, source: string): void {
    const index = output.findIndex((item) => item.type === 'asset' && item.fileName === fileName)
    const asset: WxOutputFile = { type: 'asset', fileName, source }
    if (index >= 0) output[index] = asset
    else output.push(asset)
}

function relativeToViteConfig(outDir: string, configFile: string | undefined, root: string): string {
    const configDirectory = configFile ? path.dirname(configFile) : root
    const relativePath = path.relative(configDirectory, outDir).replaceAll('\\', '/')
    if (!relativePath) return '.'
    return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}

function isFileInside(file: string, directory: string): boolean {
    if (!directory) return false
    const relative = path.relative(directory, file)
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function isSafeJavaScriptPatch(
    files: string[],
    output: WxDevEngineUpdate
): output is Extract<WxDevEngineUpdate, { type: 'Patch' }> {
    if (output.type !== 'Patch' || output.hmrBoundaries.length === 0) return false
    if (output.code.includes('__vite__updateStyle') || output.code.includes('.updateStyle(')) return false
    return files.every((file) => /\.[cm]?[jt]sx?$/.test(file))
}
