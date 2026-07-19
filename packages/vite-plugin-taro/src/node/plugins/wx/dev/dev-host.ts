import { randomUUID } from 'node:crypto'
import path from 'node:path'
import {
    BehaviorSubject,
    catchError,
    concatMap,
    filter,
    from,
    map,
    Subject,
    type Subscription,
    withLatestFrom
} from 'rxjs'
import type { ViteDevServer } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { type BuildAvailability, createControlChannel } from './control-channel.ts'
import { createDevEngineEdge, type DevEngineHmrResult } from './dev-engine.ts'
import { createPhysicalOutputEdge } from './physical-output.ts'
import { preparePublicFiles, watchPublicFiles } from './public-files.ts'
import { createHmrTopology } from './topology/session.ts'
import type {
    BootstrapWriteResult,
    BuildReason,
    BuildRequest,
    CompleteBuildResult,
    HmrCommand,
    SafePatchFact,
    UpdatePoll,
    UpdateWriteResult
} from './topology/types.ts'

const maximumPatchCount = 100
const safeJavaScriptExtensions = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx'])

/** Wires effectful WX development edges around the pure fact-to-command topology. */
export async function createDevHost(
    server: ViteDevServer,
    options: VitePluginTaroOptions
): Promise<{ close(): Promise<void> }> {
    const outDir = path.resolve(server.config.root, server.config.build.outDir)
    const initialBuildId = randomUUID()
    const pageFiles = new Set(options.pages.map((page) => `${page.path}.js`))

    await preparePublicFiles({
        emptyOutDir: server.config.build.emptyOutDir !== false,
        outDir,
        publicDir: server.config.publicDir || ''
    })

    const buildRequests$ = new Subject<BuildRequest>()
    const completeBuildResults$ = new Subject<CompleteBuildResult>()
    const bootstrapWriteResults$ = new Subject<BootstrapWriteResult>()
    const safePatches$ = new Subject<SafePatchFact>()
    const polls$ = new Subject<UpdatePoll>()
    const updateWriteResults$ = new Subject<UpdateWriteResult>()
    const rebuildReasons$ = new Subject<Exclude<BuildReason, 'initial'>>()
    const buildAvailability$ = new BehaviorSubject<BuildAvailability>({
        buildId: initialBuildId,
        kind: 'building'
    })
    const subscriptions: Subscription[] = []

    const devEngine = createDevEngineEdge({ pageFiles, server })
    const commands$ = createHmrTopology(
        {
            bootstrapWriteResults$,
            buildRequests$,
            completeBuildResults$,
            polls$,
            safePatches$,
            updateWriteResults$
        },
        { maximumPatchCount }
    )
    const control = createControlChannel({
        buildAvailability$,
        commands$,
        polls$,
        registerModules: devEngine.registerModules,
        requestRebuild: () => rebuildReasons$.next('patch-execution-failed'),
        server,
        updateWriteResults$
    })
    const physicalOutput = createPhysicalOutputEdge({ outDir, server, token: control.token })

    subscriptions.push(
        rebuildReasons$
            .pipe(
                withLatestFrom(buildAvailability$),
                filter(([, availability]) => availability.kind !== 'building'),
                map(([reason]): BuildRequest => ({ buildId: randomUUID(), reason }))
            )
            .subscribe(buildRequests$),
        devEngine.hmrResults$
            .pipe(withLatestFrom(buildAvailability$))
            .subscribe(([result, availability]) => handleHmrResult(result, availability)),
        devEngine.additionalAssets$
            .pipe(
                withLatestFrom(buildAvailability$),
                filter(([, availability]) => availability.kind === 'active')
            )
            .subscribe(() => rebuildReasons$.next('native-output-changed')),
        commands$
            .pipe(
                concatMap((command) =>
                    from(executeCommand(command)).pipe(
                        catchError((error: unknown) => {
                            reportError(`command ${command.kind}`, error)
                            return []
                        })
                    )
                )
            )
            .subscribe()
    )

    const publicFiles = watchPublicFiles({
        onChanged: () => rebuildReasons$.next('native-output-changed'),
        onError: (error) => reportError('public file synchronization', error),
        outDir,
        publicDir: server.config.publicDir,
        watcher: server.watcher
    })

    buildRequests$.next({ buildId: initialBuildId, reason: 'initial' })

    return {
        async close(): Promise<void> {
            control.close()
            await publicFiles.close()
            physicalOutput.close()
            for (const subscription of subscriptions) {
                subscription.unsubscribe()
            }
            rebuildReasons$.complete()
            buildRequests$.complete()
            completeBuildResults$.complete()
            bootstrapWriteResults$.complete()
            safePatches$.complete()
            polls$.complete()
            updateWriteResults$.complete()
        }
    }

    async function executeCommand(command: HmrCommand): Promise<void> {
        switch (command.kind) {
            case 'run-build': {
                buildAvailability$.next({ buildId: command.request.buildId, kind: 'building' })
                const result = await devEngine.runBuild(command.request)
                if (!result.ok) {
                    buildAvailability$.next({ buildId: command.request.buildId, kind: 'failed' })
                    reportError('complete build', result.error)
                }
                completeBuildResults$.next(result)
                return
            }
            case 'write-bootstrap': {
                let result: BootstrapWriteResult
                try {
                    await physicalOutput.writeBootstrap(command.epoch)
                    buildAvailability$.next({ buildId: command.epoch.buildId, kind: 'active' })
                    result = { buildId: command.epoch.buildId, ok: true }
                } catch (error) {
                    buildAvailability$.next({ buildId: command.epoch.buildId, kind: 'failed' })
                    reportError('HMR bootstrap write', error)
                    result = { buildId: command.epoch.buildId, error, ok: false }
                }
                bootstrapWriteResults$.next(result)
                return
            }
            case 'write-update': {
                const { publication } = command
                let result: UpdateWriteResult
                try {
                    await physicalOutput.writeUpdate(publication)
                    result = {
                        buildId: publication.buildId,
                        ok: true,
                        publicationId: publication.publicationId,
                        requestId: publication.requestId
                    }
                } catch (error) {
                    reportError('HMR update write', error)
                    result = {
                        buildId: publication.buildId,
                        error,
                        ok: false,
                        publicationId: publication.publicationId,
                        requestId: publication.requestId
                    }
                }
                updateWriteResults$.next(result)
                return
            }
            case 'request-rebuild':
                rebuildReasons$.next(command.reason)
        }
    }

    function handleHmrResult(result: DevEngineHmrResult, availability: BuildAvailability): void {
        if (availability.kind !== 'active') {
            return
        }
        if (result instanceof Error) {
            reportError('HMR generation', result)
            rebuildReasons$.next('rolldown-full-reload')
            return
        }
        if (!result.changedFiles.every(isSafeJavaScriptChange)) {
            rebuildReasons$.next('native-output-changed')
            return
        }
        if (result.updates.some(({ update }) => update.type === 'FullReload')) {
            rebuildReasons$.next('rolldown-full-reload')
            return
        }

        for (const { clientId, update } of result.updates) {
            if (update.type !== 'Patch') {
                continue
            }
            safePatches$.next({
                buildId: availability.buildId,
                clientId,
                patch: {
                    code: update.code,
                    fileName: update.filename,
                    sourcemap: update.sourcemap,
                    sourcemapFileName: update.sourcemapFilename
                }
            })
        }
    }

    function reportError(operation: string, error: unknown): void {
        const normalizedError = error instanceof Error ? error : new Error(String(error))
        server.config.logger.error(`[vite-plugin-taro] wx ${operation} failed`, { error: normalizedError })
    }
}

function isSafeJavaScriptChange(fileName: string): boolean {
    return safeJavaScriptExtensions.has(path.extname(fileName.split('?', 1)[0]).toLowerCase())
}
