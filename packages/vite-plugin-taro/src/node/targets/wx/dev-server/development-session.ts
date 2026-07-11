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
import { wxDevelopmentDirectory, wxUpdateControlFile, wxUpdateFile } from '../development-files.ts'
import {
    isWxFullBuildOutput,
    normalizeWxBundleStyles,
    setWxAppStyles,
    type WxOutputFile
} from './development-output.ts'
import { transformWxCompatibleJavaScript, transformWxOutputChunks } from './javascript-compatibility.ts'
import { collectWxBundleModuleIds, collectWxPatchModuleIds } from './module-ids.ts'
import { syncWxPublicDirectory, syncWxPublicFile, writeWxOutputFile, writeWxOutputFiles } from './output-writer.ts'
import { WxUpdateTransport } from './update-transport.ts'
import { ViteBundledDevAdapter, type WxDevEngineUpdate } from './vite-bundled-dev-adapter.ts'

const maxRetainedDeltaCount = 1_000
const maxRetainedDeltaBytes = 16 * 1024 * 1024
const fullBuildDebounceDelay = 100

type WxDevServerContext = Pick<BuildContext, 'vite' | 'css'>

/** Owns one WX bundled-development graph and all writes to its fixed output directory. */
export class WxDevelopmentSession {
    private readonly adapter: ViteBundledDevAdapter
    private readonly updateTransport: WxUpdateTransport
    private readonly outDir: string
    private readonly initialBundleReady: Promise<void>
    private markInitialBundleReady!: () => void
    private originalPrintUrls: (() => void) | undefined
    private outputWork = Promise.resolve()
    private rebuildRequested = false
    private rebuildTimer: NodeJS.Timeout | undefined
    private rebuildWork: Promise<void> | undefined
    private latestAppStyles = ''
    private initialBundleWritten = false
    private closed = false

    constructor(
        private readonly context: WxDevServerContext,
        private readonly server: ViteDevServer
    ) {
        const config = context.vite
        this.outDir = path.resolve(config.root, config.build.outDir)
        this.updateTransport = new WxUpdateTransport(
            server,
            () => this.requestFullBuild(),
            (buildId, source) =>
                this.enqueueOutput(async () => {
                    // A full build queued before this write invalidates the old batch instead of letting it overwrite
                    // the new build's empty update.js.
                    if (!this.updateTransport.isCurrentBuild(buildId)) return
                    await writeWxOutputFile(this.outDir, wxUpdateFile, source)
                })
        )
        this.initialBundleReady = new Promise<void>((resolve) => {
            this.markInitialBundleReady = resolve
        })
        this.adapter = new ViteBundledDevAdapter(config, server, {
            onOutput: (output) => this.handleBundleOutput(output),
            onPatch: (files, output) => this.handlePatch(files, output),
            onError: (message) => this.handleError(message),
            waitForInitialBundle: () => this.waitForInitialBundle()
        })
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
        if (this.closed) return
        this.closed = true
        this.server.watcher.off('change', this.handleWatchedFile)
        this.server.watcher.off('add', this.handleWatchedFile)
        this.server.watcher.off('unlink', this.handleWatchedFile)
        this.server.httpServer?.off('listening', this.handleHttpListening)
        if (this.server.printUrls === this.printUrls && this.originalPrintUrls) {
            this.server.printUrls = this.originalPrintUrls
        }
        if (this.rebuildTimer) clearTimeout(this.rebuildTimer)
        this.updateTransport.close()
        await this.rebuildWork
        await this.outputWork
    }

    private readonly printUrls = (): void => {
        this.originalPrintUrls?.()
        const projectDirectory = relativeToViteConfig(this.outDir, this.config.configFile, this.config.root)
        this.server.config.logger.info(
            `  ${colors.green('➜')}  ${colors.bold('WeChat DevTools')}: ${colors.cyan(projectDirectory)}`
        )
    }

    private readonly handleHttpListening = (): void => {
        this.enqueueOutput(() =>
            writeWxOutputFile(this.outDir, wxUpdateControlFile, this.updateTransport.createControlSource())
        )
    }

    private readonly handleWatchedFile = (file: string): void => {
        if (isFileInside(file, this.config.publicDir)) {
            this.enqueueOutput(() => syncWxPublicFile(this.config.publicDir, this.outDir, file))
            this.requestFullBuild()
        }
    }

    private handleBundleOutput(output: WxOutputFile[]): void {
        const appStyles = normalizeWxBundleStyles(output)
        if (appStyles !== undefined) this.latestAppStyles = appStyles
        if (isWxFullBuildOutput(output) && this.latestAppStyles) setWxAppStyles(output, this.latestAppStyles)

        if (!isWxFullBuildOutput(output)) {
            this.enqueueOutput(async () => {
                await transformWxOutputChunks(output)
                await writeWxOutputFiles(this.outDir, output)
            })
            return
        }

        const moduleIds = collectWxBundleModuleIds(output, this.config.root)
        const buildId = this.updateTransport.createBuildId()
        setDevelopmentAsset(output, wxUpdateControlFile, this.updateTransport.createControlSource(buildId))
        setDevelopmentAsset(output, wxUpdateFile, 'void 0;\n')
        this.enqueueOutput(async () => {
            await transformWxOutputChunks(output)
            if (!this.initialBundleWritten) {
                // The directory is plugin-owned; clearing it once removes stale files from previous protocol designs.
                await fs.rm(path.join(this.outDir, wxDevelopmentDirectory), { recursive: true, force: true })
            }
            // Invalidate old HTTP reports before writing the new build epoch into the fixed DevTools directory.
            this.updateTransport.commitFullBuild(buildId)
            await writeWxOutputFiles(this.outDir, output)
            await syncWxPublicDirectory(this.config.publicDir, this.outDir)
            this.adapter.registerModules(moduleIds)
            this.initialBundleWritten = true
            this.markInitialBundleReady()
            this.server.config.logger.info(
                `[vite-plugin-taro] WX bundle ready (${moduleIds.length} modules, ${output.length} files)`
            )
        })
    }

    private handlePatch(files: string[], output: WxDevEngineUpdate): boolean {
        if (!isSafeJavaScriptPatch(files, output)) {
            this.requestFullBuild()
            return false
        }

        this.adapter.registerModules(collectWxPatchModuleIds(output.code))
        this.enqueueOutput(async () => {
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
        if (this.closed) return
        this.rebuildRequested = true
        if (this.rebuildWork) return
        if (this.rebuildTimer) clearTimeout(this.rebuildTimer)
        // CSS and public-file edits commonly arrive as a burst; rebuild only after their trailing edge.
        this.rebuildTimer = setTimeout(() => {
            this.rebuildTimer = undefined
            this.rebuildWork = this.runRebuild().finally(() => {
                this.rebuildWork = undefined
                if (this.rebuildRequested) this.requestFullBuild()
            })
        }, fullBuildDebounceDelay)
    }

    private async runRebuild(): Promise<void> {
        if (!this.rebuildRequested || this.closed) return
        this.rebuildRequested = false
        try {
            await this.adapter.rebuild()
        } catch (error) {
            const normalizedError = error instanceof Error ? error : new Error(String(error))
            this.server.config.logger.error('[vite-plugin-taro] WX rebuild failed', { error: normalizedError })
        }
    }

    private async waitForInitialBundle(): Promise<void> {
        await this.initialBundleReady
        await this.outputWork
    }

    private enqueueOutput(task: () => Promise<void>): Promise<void> {
        const work = this.outputWork.then(task)
        this.outputWork = work.catch((error: unknown) => {
            const normalizedError = error instanceof Error ? error : new Error(String(error))
            this.server.config.logger.error(
                `[vite-plugin-taro] WX development output failed: ${normalizedError.stack ?? normalizedError.message}`
            )
        })
        return work
    }
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
