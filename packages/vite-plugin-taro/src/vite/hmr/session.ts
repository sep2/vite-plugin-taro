import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { UserConfig, ViteBuilder, ViteDevServer } from 'vite'
import { createBuilder } from 'vite'
import type { VitePluginTaroBuildContext } from '../types.ts'
import { createPageComponentImport, toImportPath } from '../utils.ts'
import { createWxHmrSnapshot, serializeWxHmrSnapshot, type WxHmrBuildResult, type WxHmrSnapshot } from './snapshot.ts'

export const wxHmrEnvironmentName = 'wx_hmr'
export const virtualWxHmrInitialId = 'virtual:vite-plugin-taro/wx-hmr/initial'
export const virtualWxHmrRefreshId = 'virtual:vite-plugin-taro/wx-hmr/refresh'
export const wxHmrUpdateFile = '__wx_hmr__/update.js'

type AssetEmitter = {
    emitFile(asset: { type: 'asset'; fileName: string; source: string | Uint8Array }): string
}

/** Owns the eager development build and serializes hot-update work. */
export class WxHmrSession {
    private version = 0
    // buildApp fills this before the normal client environment asks for virtual modules/assets.
    private initialSnapshot?: WxHmrSnapshot
    private codeFingerprint = ''
    private nonJavaScriptFingerprint = ''
    private updateQueue = Promise.resolve()

    constructor(private readonly context: VitePluginTaroBuildContext) {}

    createViteConfig(): UserConfig {
        return {
            builder: {
                sharedPlugins: true,
                buildApp: async (builder) => {
                    const hmrEnvironment = builder.environments[wxHmrEnvironmentName]!
                    const clientEnvironment = builder.environments.client!
                    const result = await builder.build(hmrEnvironment)
                    this.initialSnapshot = createWxHmrSnapshot(result as WxHmrBuildResult, this.context)
                    await builder.build(clientEnvironment)
                }
            },
            environments: {
                [wxHmrEnvironmentName]: {
                    consumer: 'client',
                    build: {
                        target: 'es2018',
                        write: false,
                        emitAssets: true,
                        copyPublicDir: false,
                        cssCodeSplit: false,
                        cssMinify: false,
                        minify: false,
                        rolldownOptions: {
                            input: createSnapshotInputs(this.context),
                            preserveEntrySignatures: 'strict',
                            // Keep every module body: factories are linked by the runtime, not this build.
                            treeshake: false,
                            output: {
                                format: 'cjs',
                                preserveModules: true,
                                preserveModulesRoot: process.cwd(),
                                entryFileNames: '[name].js',
                                chunkFileNames: '[name].js',
                                assetFileNames: 'assets/[name][extname]',
                                strictExecutionOrder: false,
                                codeSplitting: true
                            }
                        }
                    }
                }
            }
        }
    }

    createInitialModule(): string {
        return serializeWxHmrSnapshot(this.getInitialSnapshot(), 0)
    }

    getInitialCss(): string {
        return this.getInitialSnapshot().css
    }

    emitInitialAssets(emitter: AssetEmitter): void {
        const snapshot = this.getInitialSnapshot()
        emitter.emitFile({ type: 'asset', fileName: wxHmrUpdateFile, source: 'void 0;\n' })
        for (const [fileName, source] of Object.entries(snapshot.assets)) {
            emitter.emitFile({ type: 'asset', fileName, source })
        }
    }

    async startServer(server: ViteDevServer): Promise<void> {
        await this.runFullBuild(server, 'initial')
    }

    queueHotUpdate(server: ViteDevServer, file: string): void {
        this.updateQueue = this.updateQueue
            .then(async () => {
                if (isInside(file, server.config.publicDir)) {
                    await this.runFullBuild(server, 'public asset change')
                    return
                }

                // Classify the generated output instead of guessing from the changed source extension.
                const snapshot = await this.buildSnapshot(server)
                if (createNonJavaScriptFingerprint(snapshot) !== this.nonJavaScriptFingerprint) {
                    await this.runFullBuild(server, 'CSS or asset output changed')
                    return
                }

                const fingerprint = createCodeFingerprint(snapshot)
                if (fingerprint === this.codeFingerprint) return
                await this.writeCodeUpdate(server, snapshot)
                this.codeFingerprint = fingerprint
            })
            .catch((error: unknown) => {
                server.config.logger.error(`[vite-plugin-taro] wx HMR failed: ${formatError(error)}`)
            })
    }

    private async runFullBuild(server: ViteDevServer, reason: string): Promise<void> {
        server.config.logger.info(`[vite-plugin-taro] wx full development build (${reason})`)
        const builder = await this.createBuilder(server)
        await builder.buildApp()
        // createBuilder loads a fresh plugin instance, so obtain this session's baseline explicitly.
        const result = await builder.build(builder.environments[wxHmrEnvironmentName]!)
        const snapshot = createWxHmrSnapshot(result as WxHmrBuildResult, this.context)
        this.codeFingerprint = createCodeFingerprint(snapshot)
        this.nonJavaScriptFingerprint = createNonJavaScriptFingerprint(snapshot)
        this.version = 0
    }

    private async buildSnapshot(server: ViteDevServer): Promise<WxHmrSnapshot> {
        const builder = await this.createBuilder(server)
        const result = await builder.build(builder.environments[wxHmrEnvironmentName]!)
        return createWxHmrSnapshot(result as WxHmrBuildResult, this.context)
    }

    private createBuilder(server: ViteDevServer): Promise<ViteBuilder> {
        return createBuilder({
            root: server.config.root,
            configFile: server.config.configFile,
            mode: server.config.mode,
            clearScreen: false,
            logLevel: server.config.logLevel
        })
    }

    private async writeCodeUpdate(server: ViteDevServer, snapshot: WxHmrSnapshot): Promise<void> {
        const version = ++this.version
        const source = serializeWxHmrSnapshot(snapshot, version)
        // DevTools already watches this dependency; overwriting it triggers the native update path.
        await writeFile(path.join(server.config.build.outDir, wxHmrUpdateFile), source)
        server.config.logger.info(
            `[vite-plugin-taro] wx code HMR ${version} (${Object.keys(snapshot.factories).length} modules, ${Math.ceil(source.length / 1024)} KiB)`
        )
    }

    private getInitialSnapshot(): WxHmrSnapshot {
        if (!this.initialSnapshot) throw new Error('wx HMR snapshot is not ready.')
        return this.initialSnapshot
    }
}

function isInside(file: string, directory: string): boolean {
    const relative = path.relative(directory, file)
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function createSnapshotInputs(context: VitePluginTaroBuildContext): Record<string, string> {
    return {
        __wx_hmr_app__: toImportPath(context.appComponentFile),
        ...Object.fromEntries(
            context.pages.map((page, index) => [`__wx_hmr_page_${index}__`, createPageComponentImport(page.path)])
        )
    }
}

function createCodeFingerprint(snapshot: WxHmrSnapshot): string {
    return createHash('sha256')
        .update(
            JSON.stringify({ factories: snapshot.factories, appRoot: snapshot.appRoot, pageRoots: snapshot.pageRoots })
        )
        .digest('hex')
}

function createNonJavaScriptFingerprint(snapshot: WxHmrSnapshot): string {
    return createHash('sha256').update(snapshot.css).update(JSON.stringify(snapshot.assets)).digest('hex')
}

function formatError(error: unknown): string {
    return error instanceof Error ? error.stack || error.message : String(error)
}
