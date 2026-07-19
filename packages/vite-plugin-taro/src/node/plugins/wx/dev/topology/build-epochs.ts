import {
    catchError,
    concat,
    concatMap,
    endWith,
    ignoreElements,
    map,
    type Observable,
    of,
    queueScheduler,
    scheduled,
    share
} from 'rxjs'
import type { BuildEpoch, BuildEvent, BuildRequest, CompleteBuildEffect, WriteBootstrapEffect } from './types.ts'

/**
 * Serializes complete physical build epochs.
 *
 * ```text
 * build request ──concatMap──> build-started → complete output → bootstrap → build-ready | build-failed
 * ```
 *
 * The explicit bootstrap phase is intentional: a baseline cannot become an active epoch until both DevEngine output and
 * its hmr/info.js plus inert hmr/update.js exist. Later requests wait for the current build lifetime; no latch or timer
 * coordinates completion.
 */
export function createBuildEvents$({
    buildRequests$,
    completeBuild,
    writeBootstrap
}: {
    /** Initial and later edge-created complete-build requests. */
    buildRequests$: Observable<BuildRequest>
    /** Complete physical DevEngine build effect. */
    completeBuild: CompleteBuildEffect
    /** Bootstrap materialization after complete output. */
    writeBootstrap: WriteBootstrapEffect
}): Observable<BuildEvent> {
    return buildRequests$.pipe(
        concatMap((request) => {
            const epoch: BuildEpoch = { buildId: request.buildId }
            return concat(
                of<BuildEvent>({ kind: 'build-started', request }),
                // A queue turn lets the current epoch synchronously cancel an in-flight update.js write in response
                // to build-started before this complete build can touch the same physical files.
                scheduled([undefined], queueScheduler).pipe(
                    concatMap(() => completeBuild(request)),
                    ignoreElements(),
                    endWith(undefined),
                    concatMap(() => writeBootstrap(epoch).pipe(ignoreElements(), endWith(undefined))),
                    map((): BuildEvent => ({ epoch, kind: 'build-ready' })),
                    catchError((error: unknown) => of<BuildEvent>({ error, kind: 'build-failed', request }))
                )
            )
        }),
        share()
    )
}
