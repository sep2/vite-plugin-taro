import { catchError, concat, concatMap, map, type Observable, of, share } from 'rxjs'
import type { BuildEpoch, BuildLifecycle, BuildRequest, CompleteBuildEffect, WriteBootstrapEffect } from './types.ts'

/**
 * Serializes complete physical build epochs.
 *
 * ```text
 * buildRequests$ --concatMap-->
 *
 *   started(request)
 *        │
 *        ▼
 *   completeBuild(request)
 *        │
 *        ▼
 *   writeBootstrap({ buildId, endpoint })
 *        │
 *        ├── succeeded(epoch)
 *        └── failed(request, error)
 * ```
 *
 * A request begins a build boundary immediately when its turn reaches this stream. Later requests wait for the current
 * build lifetime to finish; complete physical builds never overlap and no mutable build-completion latch is required.
 */
export function createBuildLifecycle$({
    buildRequests$,
    completeBuild,
    writeBootstrap
}: {
    /** Edge-created initial and rebuild requests. */
    buildRequests$: Observable<BuildRequest>
    /** Complete physical DevEngine build effect. */
    completeBuild: CompleteBuildEffect
    /** HMR bootstrap writer effect that follows complete output. */
    writeBootstrap: WriteBootstrapEffect
}): Observable<BuildLifecycle> {
    return buildRequests$.pipe(
        concatMap((request) => {
            const epoch: BuildEpoch = { buildId: request.buildId, endpoint: request.endpoint }
            return concat(
                of<BuildLifecycle>({ kind: 'started', request }),
                completeBuild(request).pipe(
                    concatMap(() => writeBootstrap(epoch)),
                    map((): BuildLifecycle => ({ epoch, kind: 'succeeded' })),
                    catchError((error: unknown) =>
                        of<BuildLifecycle>({
                            failure: { error, request },
                            kind: 'failed'
                        })
                    )
                )
            )
        }),
        share()
    )
}
