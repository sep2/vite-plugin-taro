import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { EMPTY, from, merge, type Observable, Subject, type Subscription } from 'rxjs'
import { catchError, concatMap, filter, map, shareReplay, withLatestFrom } from 'rxjs/operators'
import type { ViteDevServer } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { createControlEdge } from './edges/control.ts'
import { createDevEngineEdge } from './edges/dev-engine.ts'
import { createPhysicalOutputEdge } from './edges/output.ts'
import { preparePublicFiles, watchPublicFiles } from './edges/public-files.ts'
import {
    createWxHostTopology,
    type FullBuildReason,
    type FullBuildRequest,
    type FullBuildResult,
    type PatchProjection,
    type ProducedPatch,
    type RuntimeFailure,
    type RuntimePatchRequest
} from './topology.ts'

const safeJavaScriptExtensions = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx'])

type Effect = () => Promise<void>

/**
 * Wires Vite's effectful WX development edges around the RxJS host topology.
 *
 * ```text
 * runtime version/failure ─┐
 * DevEngine patch/full ────┼──▶ createWxHostTopology ─┬─ fullBuildReasons$ ───▶ DevEngine full build
 * physical write failure ──┘                          ├─ fullMaterializations$ ▶ bootstrap/info writer
 *                                                      └─ patchProjections$ ───▶ patches.js writer
 *
 * Every edge result returns as an input stream. The topology itself has no subscriptions, runtime registry, pending
 * delivery, or last runtime version.
 * ```
 */
export async function createDevHost(
    server: ViteDevServer,
    options: VitePluginTaroOptions
): Promise<Readonly<{ close(): Promise<void> }>> {
    const outDir = path.resolve(server.config.root, server.config.build.outDir)
    const pageFiles = new Set(options.pages.map((page) => `${page.path}.js`))
    const fullBuildReasons$ = new Subject<FullBuildReason>()
    const fullBuildResults$ = new Subject<FullBuildResult>()
    const fullMaterializationFailures$ = new Subject<Readonly<{ buildId: string }>>()
    const patchesWriteFailures$ = new Subject<Readonly<{ buildId: string }>>()
    const producedPatches$ = new Subject<ProducedPatch>()
    const runtimeFailures$ = new Subject<RuntimeFailure>()
    const runtimeRequests$ = new Subject<RuntimePatchRequest>()
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
        reportFailure: (failure) => runtimeFailures$.next(failure),
        requestPatches: (request) => runtimeRequests$.next(request),
        server
    })
    const physicalOutput = createPhysicalOutputEdge({ outDir, server, token: control.token })
    const topology = createWxHostTopology({
        fullBuildReasons$,
        fullBuildResults$,
        fullMaterializationFailures$,
        patchesWriteFailures$,
        producedPatches$,
        runtimeFailures$,
        runtimeRequests$
    })

    // This derives the build identity from the topology input stream; no mutable runtime/session record is retained.
    const activeBuildId$ = fullBuildResults$.pipe(
        filter((result): result is Extract<FullBuildResult, { ok: true }> => result.ok),
        map((result) => result.buildId),
        shareReplay({ bufferSize: 1, refCount: true })
    )

    const effects$: Observable<Effect> = merge(
        topology.fullBuildReasons$.pipe(
            map(
                (reason): Effect =>
                    () =>
                        runFullBuild(reason)
            )
        ),
        topology.fullMaterializations$.pipe(
            map(
                (build): Effect =>
                    () =>
                        materializeFull(build)
            )
        ),
        topology.patchProjections$.pipe(
            map(
                (projection): Effect =>
                    () =>
                        materializePatches(projection)
            )
        )
    )
    subscriptions.push(
        effects$
            .pipe(
                // Physical writes and full builds share one lane. Patches may accumulate in topology history while it
                // is busy; the next stateless runtime version request selects the complete latest suffix.
                concatMap((effect) => from(effect()).pipe(catchError((error: unknown) => reportEffectFailure(error))))
            )
            .subscribe()
    )

    subscriptions.push(
        devEngine.hmrResults$.pipe(withLatestFrom(activeBuildId$)).subscribe(([result, buildId]) => {
            if (result instanceof Error) {
                reportError('HMR generation', result)
                fullBuildReasons$.next('patch-generation-failed')
                return
            }
            if (
                !result.changedFiles.every(isSafeJavaScriptChange) ||
                result.updates.some(({ update }) => update.type === 'FullReload')
            ) {
                fullBuildReasons$.next('source-requires-full-build')
                return
            }
            for (const { clientId, update } of result.updates) {
                if (update.type !== 'Patch') {
                    continue
                }
                producedPatches$.next({
                    buildId,
                    clientId,
                    patch: {
                        code: update.code,
                        fileName: update.filename,
                        sourcemap: update.sourcemap,
                        sourcemapFileName: update.sourcemapFilename
                    }
                })
            }
        }),
        devEngine.additionalAssets$.subscribe(() => fullBuildReasons$.next('source-requires-full-build'))
    )

    const publicFiles = watchPublicFiles({
        onChanged: () => fullBuildReasons$.next('source-requires-full-build'),
        onError: (error) => reportError('public file synchronization', error),
        outDir,
        publicDir: server.config.publicDir,
        watcher: server.watcher
    })

    // Every stream consumer is attached before the initial full-build reason enters the topology.
    fullBuildReasons$.next('initial')

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

    async function runFullBuild(reason: FullBuildReason): Promise<void> {
        const request: FullBuildRequest = { buildId: randomUUID(), reason }
        const result = await devEngine.runBuild(request)
        if (!result.ok) {
            reportError('complete build', result.error)
        }
        if (!closed) {
            fullBuildResults$.next(result)
        }
    }

    async function materializeFull(build: Readonly<{ buildId: string }>): Promise<void> {
        try {
            await physicalOutput.writeBootstrap(build)
        } catch (error) {
            reportError('full WX materialization', error)
            if (!closed) {
                fullMaterializationFailures$.next(build)
            }
        }
    }

    async function materializePatches(projection: PatchProjection): Promise<void> {
        try {
            await physicalOutput.writePatches(projection)
        } catch (error) {
            reportError('patches.js materialization', error)
            if (!closed) {
                patchesWriteFailures$.next({ buildId: projection.buildId })
            }
        }
    }

    function reportEffectFailure(error: unknown): Observable<never> {
        reportError('WX development effect', error)
        return EMPTY
    }
}

function isSafeJavaScriptChange(fileName: string): boolean {
    return safeJavaScriptExtensions.has(path.extname(fileName.split('?', 1)[0]).toLowerCase())
}

function reportError(operation: string, error: unknown): void {
    const normalized = error instanceof Error ? error : new Error(String(error))
    console.error(`[vite-plugin-taro] wx ${operation} failed`, normalized)
}
