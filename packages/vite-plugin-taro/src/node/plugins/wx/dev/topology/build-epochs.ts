import { concatMap, EMPTY, filter, map, merge, type Observable, of, share, switchMap, take } from 'rxjs'
import type {
    BootstrapWriteResult,
    BuildEpoch,
    BuildRequest,
    CompleteBuildResult,
    RunBuildCommand,
    WriteBootstrapCommand
} from './types.ts'

/** Internal build-flow value used to begin an epoch only after both edge operations succeed. */
export type BuildFlowValue = RunBuildCommand | WriteBootstrapCommand | EpochReady

type EpochReady = Readonly<{
    epoch: BuildEpoch
    kind: 'epoch-ready'
}>

/**
 * Turns build requests and operation-result facts into a serialized command flow.
 *
 * ```text
 * request → run-build ──success──> write-bootstrap ──success──> epoch-ready
 *                      └─failure──> complete          └─failure──> complete
 * ```
 *
 * `concatMap` prevents complete physical builds from overlapping. Each result listener is established before its command
 * is exposed, so even a synchronous edge adapter cannot lose feedback. Failures remain observable as edge-owned facts;
 * the topology ends that request and advances to the next queued request.
 */
export function createBuildFlow$({
    bootstrapWriteResults$,
    buildRequests$,
    completeBuildResults$
}: {
    bootstrapWriteResults$: Observable<BootstrapWriteResult>
    buildRequests$: Observable<BuildRequest>
    completeBuildResults$: Observable<CompleteBuildResult>
}): Observable<BuildFlowValue> {
    return buildRequests$.pipe(
        concatMap((request) =>
            merge(
                completeBuildResults$.pipe(
                    filter((result) => result.buildId === request.buildId),
                    take(1),
                    switchMap((result) =>
                        result.ok ? createBootstrapFlow$(request.buildId, bootstrapWriteResults$) : EMPTY
                    )
                ),
                of<BuildFlowValue>({ kind: 'run-build', request })
            )
        ),
        share()
    )
}

/** Emits the bootstrap command, then waits for its correlated result before activating the epoch. */
function createBootstrapFlow$(
    buildId: string,
    bootstrapWriteResults$: Observable<BootstrapWriteResult>
): Observable<BuildFlowValue> {
    const epoch: BuildEpoch = { buildId }
    return merge(
        bootstrapWriteResults$.pipe(
            filter((result) => result.buildId === buildId),
            take(1),
            switchMap((result) => (result.ok ? of(result) : EMPTY)),
            map((): BuildFlowValue => ({ epoch, kind: 'epoch-ready' }))
        ),
        of<BuildFlowValue>({ epoch, kind: 'write-bootstrap' })
    )
}

export function isBuildCommand(value: BuildFlowValue): value is RunBuildCommand | WriteBootstrapCommand {
    return value.kind === 'run-build' || value.kind === 'write-bootstrap'
}

export function isEpochReady(value: BuildFlowValue): value is EpochReady {
    return value.kind === 'epoch-ready'
}
