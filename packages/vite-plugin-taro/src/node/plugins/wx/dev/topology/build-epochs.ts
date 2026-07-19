import { catchError, concat, concatMap, map, type Observable, of, share } from 'rxjs'
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
                completeBuild(request).pipe(
                    concatMap(() => writeBootstrap(epoch)),
                    map((): BuildEvent => ({ epoch, kind: 'build-ready' })),
                    catchError((error: unknown) => of<BuildEvent>({ error, kind: 'build-failed', request }))
                )
            )
        }),
        share()
    )
}
