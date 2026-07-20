// Imports are intentionally deferred while the control, output, and DevEngine edges are rewritten around this host.

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
export async function createDevHost(server, options) {
    const outDir = path.resolve(server.config.root, server.config.build.outDir)
    const pageFiles = new Set(options.pages.map((page) => `${page.path}.js`))
    const closed$ = new Subject()
    const fullBuildReasons$ = new Subject()
    const fullBuildResults$ = new Subject()
    const fullMaterializationFailures$ = new Subject()
    const patchesWriteFailures$ = new Subject()
    const producedPatches$ = new Subject()
    const runtimeFailures$ = new Subject()
    const runtimeRequests$ = new Subject()
    const subscriptions = []
    let closed = false

    await preparePublicFiles({
        emptyOutDir: server.config.build.emptyOutDir !== false,
        outDir,
        publicDir: server.config.publicDir || ''
    })

    const devEngine = createDevEngineEdge({ pageFiles, server })
    const control = createControlChannel({
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

    // DevEngine HMR results need the current build identity, but no mutable host variable retains it.
    const activeBuildId$ = fullBuildResults$.pipe(
        filter((result) => result.ok),
        map((result) => result.buildId),
        shareReplay({ bufferSize: 1, refCount: true })
    )

    const effects$ = merge(
        topology.fullBuildReasons$.pipe(map((reason) => () => runFullBuild(reason))),
        topology.fullMaterializations$.pipe(map((build) => () => materializeFull(build))),
        topology.patchProjections$.pipe(map((projection) => () => materializePatches(projection)))
    )
    subscriptions.push(
        effects$
            .pipe(
                // Physical writes and full builds share one ordered edge. Safe patches may still accumulate in the
                // topology while this queue is busy; a later runtime request projects the complete latest suffix.
                concatMap((effect) => from(effect()).pipe(catchError((error) => reportEffectFailure(error))))
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

    // All effect subscribers are connected before this first fact enters the topology.
    fullBuildReasons$.next('initial')

    return {
        async close() {
            closed = true
            closed$.next()
            closed$.complete()
            control.close()
            await publicFiles.close()
            physicalOutput.close()
            for (const subscription of subscriptions) {
                subscription.unsubscribe()
            }
        }
    }

    async function runFullBuild(reason) {
        const request = { buildId: randomUUID(), reason }
        const result = await devEngine.runBuild(request)
        if (!result.ok) {
            reportError('complete build', result.error)
        }
        fullBuildResults$.next(result)
    }

    async function materializeFull(build) {
        try {
            await physicalOutput.writeBootstrap(build)
        } catch (error) {
            reportError('full WX materialization', error)
            fullMaterializationFailures$.next(build)
        }
    }

    async function materializePatches(projection) {
        try {
            await physicalOutput.writePatches(projection)
        } catch (error) {
            reportError('patches.js materialization', error)
            patchesWriteFailures$.next({ buildId: projection.buildId })
        }
    }

    function reportEffectFailure(error) {
        reportError('WX development effect', error)
        return EMPTY
    }
}

function isSafeJavaScriptChange(fileName) {
    return safeJavaScriptExtensions.has(path.extname(fileName.split('?', 1)[0]).toLowerCase())
}

function reportError(operation, error) {
    const normalized = error instanceof Error ? error : new Error(String(error))
    console.error(`[vite-plugin-taro] wx ${operation} failed`, normalized)
}
