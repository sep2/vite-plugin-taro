import path from 'node:path'
import type { ResolvedConfig, ViteDevServer } from 'vite'
import type { WxRuntimeClassNameTransformer } from '../vite/taro-css.ts'
import { WxBundledDevAdapter, type WxHmrOutput } from './bundled-dev-adapter.ts'
import { syncWxPublicDirectory, syncWxPublicFile, type WxOutputFile, writeWxOutput } from './output-writer.ts'
import { WxPatchJournal } from './patch-journal.ts'

const maxPatchCount = 1_000
const maxPatchBytes = 16 * 1024 * 1024

/** Owns one WX bundled-development graph and all writes to its fixed output directory. */
export class WxDevelopmentSession {
    private readonly adapter: WxBundledDevAdapter
    private readonly journal: WxPatchJournal
    private readonly outDir: string
    private readonly initialOutput: Promise<void>
    private resolveInitialOutput!: () => void
    private work = Promise.resolve()
    private rebuildRequested = false
    private rebuildTimer: NodeJS.Timeout | undefined
    private rebuildWork: Promise<void> | undefined
    private latestWxss = ''
    private closed = false

    constructor(
        private readonly config: ResolvedConfig,
        private readonly server: ViteDevServer,
        private readonly transformRuntimeClassNames: WxRuntimeClassNameTransformer
    ) {
        this.outDir = path.resolve(config.root, config.build.outDir)
        this.journal = new WxPatchJournal(this.outDir)
        this.initialOutput = new Promise<void>((resolve) => {
            this.resolveInitialOutput = resolve
        })
        this.adapter = new WxBundledDevAdapter(config, server, {
            onOutput: (output) => this.handleOutput(output),
            onPatch: (files, output) => this.handlePatch(files, output),
            onError: (message) => this.handleError(message),
            waitUntilReady: () => this.waitUntilReady()
        })
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
        await this.work
    }

    private readonly handleWatchedFile = (file: string): void => {
        if (isWithin(file, this.config.publicDir)) {
            this.enqueue(() => syncWxPublicFile(this.config.publicDir, this.outDir, file))
            this.requestFullBuild()
        }
    }

    private handleOutput(output: WxOutputFile[]): void {
        const wxss = normalizeWxStyles(output)
        if (wxss !== undefined) this.latestWxss = wxss
        if (isFullOutput(output)) {
            if (this.latestWxss) setAppWxss(output, this.latestWxss)
            stampFullOutput(output)
        }

        if (!isFullOutput(output)) {
            this.enqueue(() => writeWxOutput(this.outDir, output))
            return
        }

        const moduleIds = collectInitialModuleIds(output, this.config.root)
        this.enqueue(async () => {
            await writeWxOutput(this.outDir, output)
            await syncWxPublicDirectory(this.config.publicDir, this.outDir)
            await this.journal.reset()
            this.adapter.registerModules(moduleIds)
            this.resolveInitialOutput()
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

        this.adapter.registerModules(collectPatchModuleIds(output.code))
        this.enqueue(async () => {
            const transformed = await this.transformRuntimeClassNames(output.code, output.filename)
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
            this.rebuildWork = this.rebuild().finally(() => {
                this.rebuildWork = undefined
                if (this.rebuildRequested) this.requestFullBuild()
            })
        }, 100)
    }

    private async rebuild(): Promise<void> {
        if (!this.rebuildRequested || this.closed) return
        this.rebuildRequested = false
        try {
            await this.adapter.rebuild()
        } catch (error) {
            const normalizedError = error instanceof Error ? error : new Error(String(error))
            this.server.config.logger.error('[vite-plugin-taro] WX rebuild failed', { error: normalizedError })
        }
    }

    private async waitUntilReady(): Promise<void> {
        await this.initialOutput
        await this.work
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

function isWithin(file: string, directory: string): boolean {
    if (!directory) return false
    const relative = path.relative(directory, file)
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
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
        code: `${app.code}\n;(globalThis.__VITE_PLUGIN_TARO_WX__ ??= {}).fullBuild = ${Date.now()};\n`
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
        } else if (item.type === 'chunk') {
            styles.push(...collectChunkStyles(item.code))
        }
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
