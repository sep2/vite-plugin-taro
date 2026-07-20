import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { EMPTY, from, Subject, type Subscription } from 'rxjs'
import { catchError, concatMap, filter, map, shareReplay, withLatestFrom } from 'rxjs/operators'
import type { ViteDevServer } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { createControlEdge } from './edges/control.ts'
import { createDevEngineEdge } from './edges/dev-engine.ts'
import { createPhysicalOutputEdge } from './edges/output.ts'
import { preparePublicFiles, watchPublicFiles } from './edges/public-files.ts'
import {
    createWxHostTopology,
    type FullBuildRequest,
    type FullBuildResult,
    type PatchProjection,
    type ProducedPatch,
    type WxHostCommand,
    type WxHostFact
} from './topology.ts'

const safeJavaScriptExtensions = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx'])

/**
 * Wires Vite's effectful WX development edges around the pure topology.
 *
 * ```text
 * facts$ ──> createWxHostTopology ──> commands$ ──> concatMap(execute edge)
 *   ▲                                                           │
 *   └────────────────────── operation-result facts ────────────┘
 * ```
 *
 * `run-full-build` is one edge operation: DevEngine output plus hmr/info.js and inert hmr/patches.js publication.
 * DevHost contains no host decisions. It only converts Vite, runtime-control, and filesystem observations into facts,
 * then converts topology commands into serialized edge calls.
 */
export async function createDevHost(
    server: ViteDevServer,
    options: VitePluginTaroOptions
): Promise<Readonly<{ close(): Promise<void> }>> {
    const outDir = path.resolve(server.config.root, server.config.build.outDir)
    const pageFiles = new Set(options.pages.map((page) => `${page.path}.js`))
    const facts$ = new Subject<WxHostFact>()
    const fullBuildResults$ = new Subject<FullBuildResult>()
    const subscriptions: Subscription[] = []
    let closed = false

    await preparePublicFiles({
        emptyOutDir: server.config.build.emptyOutDir !== false,
        outDir,
        publicDir: server.config.publicDir || ''
    })

    const devEngine = createDevEngineEdge({ pageFiles, server })
    const control = createControlEdge({
        registerModules: devEngine.registerModules,
        reportFailure: (failure) => facts$.next({ type: 'runtime-failed', failure }),
        requestPatches: (request) => facts$.next({ type: 'runtime-requested', request }),
        server
    })
    const physicalOutput = createPhysicalOutputEdge({ outDir, server, token: control.token })
    const commands$ = createWxHostTopology(facts$)

    // DevEngine HMR facts require the current baseline ID, derived from full-build result facts rather than host state.
    const activeBuildId$ = fullBuildResults$.pipe(
        filter((result): result is Extract<FullBuildResult, { ok: true }> => result.ok),
        map((result) => result.buildId),
        shareReplay({ bufferSize: 1, refCount: true })
    )

    subscriptions.push(
        commands$
            .pipe(concatMap((command) => from(executeCommand(command)).pipe(catchError(commandFailure))))
            .subscribe(facts$),
        devEngine.hmrResults$.pipe(withLatestFrom(activeBuildId$)).subscribe(([result, buildId]) => {
            if (result instanceof Error) {
                reportError('HMR generation', result)
                facts$.next({ type: 'full-build-requested', reason: 'patch-generation-failed' })
                return
            }
            if (
                !result.changedFiles.every(isSafeJavaScriptChange) ||
                result.updates.some(({ update }) => update.type === 'FullReload')
            ) {
                facts$.next({ type: 'full-build-requested', reason: 'source-requires-full-build' })
                return
            }
            for (const { clientId, update } of result.updates) {
                if (update.type !== 'Patch') {
                    continue
                }
                const patch: ProducedPatch = {
                    buildId,
                    clientId,
                    patch: {
                        code: update.code,
                        fileName: update.filename,
                        sourcemap: update.sourcemap,
                        sourcemapFileName: update.sourcemapFilename
                    }
                }
                facts$.next({ type: 'patch-produced', patch })
            }
        }),
        devEngine.additionalAssets$.subscribe(() => {
            facts$.next({ type: 'full-build-requested', reason: 'source-requires-full-build' })
        })
    )

    const publicFiles = watchPublicFiles({
        onChanged: () => facts$.next({ type: 'full-build-requested', reason: 'source-requires-full-build' }),
        onError: (error) => reportError('public file synchronization', error),
        outDir,
        publicDir: server.config.publicDir,
        watcher: server.watcher
    })

    // Attach all command and result consumers before starting the first complete physical build.
    facts$.next({ type: 'full-build-requested', reason: 'initial' })

    return {
        async close(): Promise<void> {
            closed = true
            control.close()
            await publicFiles.close()
            physicalOutput.close()
            for (const subscription of subscriptions) {
                subscription.unsubscribe()
            }
        }
    }

    async function executeCommand(command: WxHostCommand): Promise<WxHostFact> {
        switch (command.kind) {
            case 'run-full-build': {
                const request: FullBuildRequest = { buildId: randomUUID(), reason: command.reason }
                let result: FullBuildResult = await devEngine.runBuild(request)
                if (result.ok) {
                    try {
                        await physicalOutput.writeBootstrap({ buildId: result.buildId })
                    } catch (error) {
                        reportError('full WX materialization', error)
                        result = { buildId: result.buildId, error, ok: false }
                    }
                }
                if (!result.ok) {
                    reportError('complete build', result.error)
                }
                if (!closed) {
                    fullBuildResults$.next(result)
                }
                return { type: 'full-build-finished', result }
            }
            case 'write-patches': {
                try {
                    await physicalOutput.writePatches(command.projection)
                    return patchesWritten(command.projection, true)
                } catch (error) {
                    reportError('patches.js materialization', error)
                    return patchesWritten(command.projection, false, error)
                }
            }
        }
    }

    function commandFailure(error: unknown) {
        reportError('WX development command', error)
        return EMPTY
    }
}

function patchesWritten(projection: PatchProjection, ok: boolean, error?: unknown): WxHostFact {
    return {
        type: 'patches-written',
        buildId: projection.buildId,
        error,
        fromVersion: projection.fromVersion,
        ok,
        targetVersion: projection.targetVersion
    }
}

function isSafeJavaScriptChange(fileName: string): boolean {
    return safeJavaScriptExtensions.has(path.extname(fileName.split('?', 1)[0]).toLowerCase())
}

function reportError(operation: string, error: unknown): void {
    const normalized = error instanceof Error ? error : new Error(String(error))
    console.error(`[vite-plugin-taro] wx ${operation} failed`, normalized)
}
