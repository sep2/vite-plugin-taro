import { concat, merge, type Observable, of } from 'rxjs'
import {
    distinctUntilChanged,
    exhaustMap,
    filter,
    ignoreElements,
    map,
    scan,
    share,
    shareReplay,
    startWith,
    switchMap,
    take,
    withLatestFrom
} from 'rxjs/operators'

/**
 * Pure WX HMR topology.
 *
 * ```text
 * facts ──> topology ──> commands ──> edge consumers
 *   ▲                                      │
 *   └──────────── operation results ───────┘
 * ```
 *
 * Patch history is the only private value retained by the stream graph. It is a bounded append-only buffer, so a long
 * development session cannot accumulate unbounded patch data. The host stores no runtime/session object, last runtime
 * version, delivery acknowledgement, build phase, or command queue. Each runtime request carries all input needed to
 * project its missing suffix from the current history snapshot.
 *
 * A full build is one edge operation: generate a fresh buildId, let DevEngine write complete output, then write
 * hmr/info.js and inert hmr/patches.js. It has no version of its own and starts patch numbering at zero.
 */

export type FullBuildReason =
    | 'history-limit'
    | 'initial'
    | 'patch-generation-failed'
    | 'patch-write-failed'
    | 'runtime-ahead-of-history'
    | 'runtime-build-mismatch'
    | 'runtime-failed'
    | 'source-requires-full-build'

/** An edge-generated full-build request. Every complete build gets a fresh identity. */
export type FullBuildRequest = Readonly<{
    buildId: string
    reason: FullBuildReason
}>

/** Result of the complete operation: DevEngine output plus physical HMR bootstrap files. */
export type FullBuildResult =
    | Readonly<{ buildId: string; ok: true }>
    | Readonly<{ buildId: string; error: unknown; ok: false }>

export type SafePatch = Readonly<{
    code: string
    fileName: string
    sourcemap?: string
    sourcemapFileName?: string
}>

/** DevEngine patch provenance. The client ID is never retained as host runtime/session state. */
export type ProducedPatch = Readonly<{
    buildId: string
    clientId: string
    patch: SafePatch
}>

/** A stateless version report from the persistent App runtime. */
export type RuntimePatchRequest = Readonly<{
    buildId: string
    clientId: string
    version: number
}>

export type RuntimeFailure = Readonly<{
    buildId: string
    clientId: string
    reason: string
    version: number
}>

/** One complete contiguous patch suffix for physical hmr/patches.js output. */
export type PatchProjection = Readonly<{
    buildId: string
    fromVersion: number
    patches: readonly SafePatch[]
    targetVersion: number
}>

/** All edge observations entering the topology. */
export type WxHostFact =
    | Readonly<{ type: 'full-build-requested'; reason: FullBuildReason }>
    | Readonly<{ type: 'full-build-finished'; result: FullBuildResult }>
    | Readonly<{ type: 'patch-produced'; patch: ProducedPatch }>
    | Readonly<{
          type: 'patches-written'
          buildId: string
          fromVersion: number
          targetVersion: number
          ok: boolean
          error?: unknown
      }>
    | Readonly<{ type: 'runtime-requested'; request: RuntimePatchRequest }>
    | Readonly<{ type: 'runtime-failed'; failure: RuntimeFailure }>

/** Effects selected by topology and performed by DevHost edges. */
export type WxHostCommand =
    | Readonly<{ kind: 'run-full-build'; reason: FullBuildReason }>
    | Readonly<{ kind: 'write-patches'; projection: PatchProjection }>

export type WxHostTopologyOptions = Readonly<{
    maximumPatchCount?: number
}>

type PatchHistory = {
    buildId: string
    limitReached: boolean
    patches: SafePatch[]
}

type SuccessfulBuild = Extract<FullBuildResult, { ok: true }>
type RuntimeRequestEffect =
    | Readonly<{ kind: 'full-build'; reason: FullBuildReason }>
    | Readonly<{ kind: 'idle' }>
    | Readonly<{ kind: 'patches'; projection: PatchProjection }>

/**
 * Derives one command stream from edge facts. No subscription or effect occurs here.
 *
 * Full-build reasons are coalesced with `exhaustMap`: the first emits a command, then its inner stream waits for the
 * corresponding `full-build-finished` operation fact before accepting another reason. This is protocol policy in the
 * pure topology, not a mutable DevHost flag.
 */
export function createWxHostTopology(
    facts$: Observable<WxHostFact>,
    { maximumPatchCount = 100 }: WxHostTopologyOptions = {}
): Observable<WxHostCommand> {
    if (!Number.isSafeInteger(maximumPatchCount) || maximumPatchCount < 1) {
        throw new RangeError('maximumPatchCount must be a positive safe integer.')
    }

    const fullBuildFinished$ = facts$.pipe(
        filter(
            (fact): fact is Extract<WxHostFact, { type: 'full-build-finished' }> => fact.type === 'full-build-finished'
        ),
        share()
    )
    const successfulBuilds$ = fullBuildFinished$.pipe(
        map(({ result }) => result),
        filter((result): result is SuccessfulBuild => result.ok),
        share()
    )

    // The buffer is private. In-place append is O(1), while projectRequest() publishes an independent slice before an
    // edge writes patch code. A successful full build replaces this whole switchMap branch and releases its buffer.
    const patchHistory$ = successfulBuilds$.pipe(
        switchMap(({ buildId }) => {
            const history: PatchHistory = { buildId, limitReached: false, patches: [] }
            return facts$.pipe(
                filter(
                    (fact): fact is Extract<WxHostFact, { type: 'patch-produced' }> =>
                        fact.type === 'patch-produced' && fact.patch.buildId === buildId
                ),
                scan((current, { patch }) => {
                    if (!current.limitReached) {
                        current.patches.push(patch.patch)
                        current.limitReached = current.patches.length >= maximumPatchCount
                    }
                    return current
                }, history),
                startWith(history)
            )
        }),
        shareReplay({ bufferSize: 1, refCount: true })
    )

    const requestEffects$ = facts$.pipe(
        filter((fact): fact is Extract<WxHostFact, { type: 'runtime-requested' }> => fact.type === 'runtime-requested'),
        withLatestFrom(patchHistory$),
        map(([{ request }, history]) => projectRequest(request, history)),
        share()
    )

    const fullBuildReasons$ = merge(
        facts$.pipe(
            filter(
                (fact): fact is Extract<WxHostFact, { type: 'full-build-requested' }> =>
                    fact.type === 'full-build-requested'
            ),
            map(({ reason }) => reason)
        ),
        patchHistory$.pipe(
            map((history) => history.limitReached),
            distinctUntilChanged(),
            filter(Boolean),
            map((): FullBuildReason => 'history-limit')
        ),
        facts$.pipe(
            filter(
                (fact): fact is Extract<WxHostFact, { type: 'patches-written' }> =>
                    fact.type === 'patches-written' && !fact.ok
            ),
            withLatestFrom(patchHistory$),
            filter(([{ buildId }, history]) => buildId === history.buildId),
            map((): FullBuildReason => 'patch-write-failed')
        ),
        facts$.pipe(
            filter((fact): fact is Extract<WxHostFact, { type: 'runtime-failed' }> => fact.type === 'runtime-failed'),
            withLatestFrom(patchHistory$),
            filter(([{ failure }, history]) => failure.buildId === history.buildId),
            map((): FullBuildReason => 'runtime-failed')
        ),
        requestEffects$.pipe(
            filter(
                (effect): effect is Extract<RuntimeRequestEffect, { kind: 'full-build' }> =>
                    effect.kind === 'full-build'
            ),
            map(({ reason }) => reason)
        )
    ).pipe(share())

    const fullBuildCommands$ = fullBuildReasons$.pipe(
        exhaustMap((reason) =>
            concat(
                of<WxHostCommand>({ kind: 'run-full-build', reason }),
                fullBuildFinished$.pipe(take(1), ignoreElements())
            )
        )
    )

    const patchCommands$ = requestEffects$.pipe(
        filter((effect): effect is Extract<RuntimeRequestEffect, { kind: 'patches' }> => effect.kind === 'patches'),
        map(({ projection }): WxHostCommand => ({ kind: 'write-patches', projection }))
    )

    return merge(fullBuildCommands$, patchCommands$).pipe(share())
}

/** Projects exactly one runtime request against the latest private patch-history value. */
function projectRequest(request: RuntimePatchRequest, history: PatchHistory): RuntimeRequestEffect {
    if (request.buildId !== history.buildId) {
        return { kind: 'full-build', reason: 'runtime-build-mismatch' }
    }
    if (!Number.isSafeInteger(request.version) || request.version < 0 || request.version > history.patches.length) {
        return { kind: 'full-build', reason: 'runtime-ahead-of-history' }
    }

    const patches = history.patches.slice(request.version)
    if (patches.length === 0) {
        return { kind: 'idle' }
    }
    return {
        kind: 'patches',
        projection: {
            buildId: history.buildId,
            fromVersion: request.version,
            patches,
            targetVersion: history.patches.length
        }
    }
}
