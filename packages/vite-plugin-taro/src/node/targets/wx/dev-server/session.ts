import path from 'node:path'
import type { ViteDevServer } from 'vite'
import type { BuildContext } from '../../../build-context.ts'
import {
    isWxFullBuildOutput,
    normalizeWxBundleStyles,
    setWxAppStyles,
    stampWxFullBuild,
    type WxOutputFile
} from './bundle-output.ts'
import { collectWxBundleModuleIds, collectWxPatchModuleIds } from './module-ids.ts'
import { syncWxPublicDirectory, syncWxPublicFile, writeWxOutputFiles } from './output-writer.ts'
import { WxPatchJournal } from './patch-journal.ts'
import { ViteBundledDevAdapter, type WxHmrOutput } from './vite-bundled-dev-adapter.ts'

const maxPatchCount = 1_000
const maxPatchBytes = 16 * 1024 * 1024

type WxDevServerContext = Pick<BuildContext, 'vite' | 'css'>

/** Owns one WX bundled-development graph and all writes to its fixed output directory. */
export class WxDevServerSession {
    private readonly adapter: ViteBundledDevAdapter
    private readonly journal: WxPatchJournal
    private readonly outDir: string
    private readonly initialBundleReady: Promise<void>
    private markInitialBundleReady!: () => void
    private outputWork = Promise.resolve()
    private rebuildRequested = false
    private rebuildTimer: NodeJS.Timeout | undefined
    private rebuildWork: Promise<void> | undefined
    private latestAppStyles = ''
    private closed = false

    constructor(
        private readonly context: WxDevServerContext,
        private readonly server: ViteDevServer
    ) {
        const config = context.vite
        this.outDir = path.resolve(config.root, config.build.outDir)
        this.journal = new WxPatchJournal(this.outDir)
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
        this.adapter.install()
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
        if (this.rebuildTimer) clearTimeout(this.rebuildTimer)
        await this.rebuildWork
        await this.outputWork
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
        if (isWxFullBuildOutput(output)) {
            if (this.latestAppStyles) setWxAppStyles(output, this.latestAppStyles)
            stampWxFullBuild(output)
        }

        if (!isWxFullBuildOutput(output)) {
            this.enqueueOutput(() => writeWxOutputFiles(this.outDir, output))
            return
        }

        const moduleIds = collectWxBundleModuleIds(output, this.config.root)
        this.enqueueOutput(async () => {
            await writeWxOutputFiles(this.outDir, output)
            await syncWxPublicDirectory(this.config.publicDir, this.outDir)
            await this.journal.reset()
            this.adapter.registerModules(moduleIds)
            this.markInitialBundleReady()
            this.server.config.logger.info(
                `[vite-plugin-taro] WX bundle ready (${moduleIds.length} modules, ${output.length} files)`
            )
        })
    }

    private handlePatch(files: string[], output: WxHmrOutput): boolean {
        if (!isSafeJavaScriptPatch(files, output)) {
            this.requestFullBuild()
            return false
        }

        this.adapter.registerModules(collectWxPatchModuleIds(output.code))
        this.enqueueOutput(async () => {
            const transformed = await this.context.css.transformWxClassNames(output.code, output.filename)
            await this.journal.append(transformed.code)
            if (this.journal.length >= maxPatchCount || this.journal.size >= maxPatchBytes) {
                this.requestFullBuild()
            }
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
        this.rebuildTimer = setTimeout(() => {
            this.rebuildTimer = undefined
            this.rebuildWork = this.runRebuild().finally(() => {
                this.rebuildWork = undefined
                if (this.rebuildRequested) this.requestFullBuild()
            })
        }, 100)
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
        this.server.config.logger.info(`[vite-plugin-taro] Open this directory in WeChat DevTools: ${this.outDir}`)
    }

    private enqueueOutput(task: () => Promise<void>): void {
        this.outputWork = this.outputWork.then(task).catch((error: unknown) => {
            const normalizedError = error instanceof Error ? error : new Error(String(error))
            this.server.config.logger.error('[vite-plugin-taro] WX development output failed', {
                error: normalizedError
            })
        })
    }
}

function isFileInside(file: string, directory: string): boolean {
    if (!directory) return false
    const relative = path.relative(directory, file)
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function isSafeJavaScriptPatch(
    files: string[],
    output: WxHmrOutput
): output is Extract<WxHmrOutput, { type: 'Patch' }> {
    if (output.type !== 'Patch' || output.hmrBoundaries.length === 0) return false
    if (output.code.includes('__vite__updateStyle') || output.code.includes('.updateStyle(')) return false
    return files.every((file) => /\.[cm]?[jt]sx?$/.test(file))
}
