import { EMPTY, merge, type Observable, of } from 'rxjs'
import { filter, map, mergeMap, scan, share, shareReplay, startWith, switchMap, withLatestFrom } from 'rxjs/operators'

/**
 * Pure WX HMR topology.
 *
 * ```text
 * facts ──> topology ──> commands ──> edge consumers
 *   ▲                                      │
 *   └──────────── operation results ───────┘
 * ```
 *
 * Patch history is the only private value retained by the stream graph. The host stores no runtime/session object, last
 * runtime version, delivery acknowledgement, build phase, or command queue. Each runtime request carries all input
 * needed to project its missing suffix from the current history snapshot.
 *
 * ```text
 * successful full build ── switchMap ──▶ patch history scan
 *                                            │
 * runtime request { buildId, version } ──────┼── withLatestFrom ──▶ physical patch projection
 *                                            │
 * runtime/write failure ─────────────────────┴── withLatestFrom ──▶ complete build command
 * ```
 *
 * A full build has a fresh `buildId`, not a version, and starts patch numbering at zero. `hmr/patches.js` only stores
 * factories in the persistent App runtime; that runtime reconciles them after Page evaluation returns.
 */

export type FullBuildReason =
    | 'initial'
    | 'full-materialization-failed'
    | 'patch-generation-failed'
    | 'patch-write-failed'
    | 'runtime-ahead-of-history'
    | 'runtime-failed'
    | 'source-requires-full-build'

/** An edge-generated full-build request. Every complete build gets a fresh identity. */
export type FullBuildRequest = Readonly<{
    buildId: string
    reason: FullBuildReason
}>

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
    | Readonly<{ type: 'full-materialized'; buildId: string; ok: boolean; error?: unknown }>
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
    | Readonly<{ kind: 'materialize-full'; buildId: string }>
    | Readonly<{ kind: 'write-patches'; projection: PatchProjection }>

type PatchHistory = Readonly<{
    buildId: string
    patches: readonly SafePatch[]
}>

type SuccessfulBuild = Extract<FullBuildResult, { ok: true }>
type RuntimeRequestFact = Extract<WxHostFact, { type: 'runtime-requested' }>

/**
 * Derives one command stream from edge facts. No subscription or effect occurs here.
 *
 * The returned stream can be consumed directly by one serialized DevHost edge lane. Every full-build, materialization,
 * and patch-write result returns to `facts$` as another fact, closing the topology loop without a mutable reducer.
 */
export function createWxHostTopology(facts$: Observable<WxHostFact>): Observable<WxHostCommand> {
    const successfulBuilds$ = facts$.pipe(
        filter(
            (fact): fact is Extract<WxHostFact, { type: 'full-build-finished' }> => fact.type === 'full-build-finished'
        ),
        map(({ result }) => result),
        filter((result): result is SuccessfulBuild => result.ok),
        share()
    )

    // A new complete build replaces the baseline and cancels the previous patch-history branch automatically.
    const patchHistory$ = successfulBuilds$.pipe(
        switchMap(({ buildId }) =>
            facts$.pipe(
                filter(
                    (fact): fact is Extract<WxHostFact, { type: 'patch-produced' }> =>
                        fact.type === 'patch-produced' && fact.patch.buildId === buildId
                ),
                map(({ patch }) => patch.patch),
                scan((patches, patch) => [...patches, patch] as readonly SafePatch[], [] as readonly SafePatch[]),
                startWith([] as readonly SafePatch[]),
                map((patches): PatchHistory => ({ buildId, patches }))
            )
        ),
        shareReplay({ bufferSize: 1, refCount: true })
    )

    const fullBuildCommands$ = merge(
        facts$.pipe(
            filter(
                (fact): fact is Extract<WxHostFact, { type: 'full-build-requested' }> =>
                    fact.type === 'full-build-requested'
            ),
            map(({ reason }): WxHostCommand => ({ kind: 'run-full-build', reason }))
        ),
        facts$.pipe(
            filter(
                (fact): fact is Extract<WxHostFact, { type: 'full-materialized' }> =>
                    fact.type === 'full-materialized' && !fact.ok
            ),
            withLatestFrom(patchHistory$),
            filter(([{ buildId }, history]) => buildId === history.buildId),
            map((): WxHostCommand => ({ kind: 'run-full-build', reason: 'full-materialization-failed' }))
        ),
        facts$.pipe(
            filter(
                (fact): fact is Extract<WxHostFact, { type: 'patches-written' }> =>
                    fact.type === 'patches-written' && !fact.ok
            ),
            withLatestFrom(patchHistory$),
            filter(([{ buildId }, history]) => buildId === history.buildId),
            map((): WxHostCommand => ({ kind: 'run-full-build', reason: 'patch-write-failed' }))
        ),
        facts$.pipe(
            filter((fact): fact is Extract<WxHostFact, { type: 'runtime-failed' }> => fact.type === 'runtime-failed'),
            withLatestFrom(patchHistory$),
            filter(([{ failure }, history]) => failure.buildId === history.buildId),
            map((): WxHostCommand => ({ kind: 'run-full-build', reason: 'runtime-failed' }))
        )
    )

    const requestCommands$ = facts$.pipe(
        filter((fact): fact is RuntimeRequestFact => fact.type === 'runtime-requested'),
        withLatestFrom(patchHistory$),
        mergeMap(([{ request }, history]) => projectRequest(request, history))
    )

    return merge(
        fullBuildCommands$,
        successfulBuilds$.pipe(map(({ buildId }): WxHostCommand => ({ buildId, kind: 'materialize-full' }))),
        requestCommands$
    ).pipe(share())
}

/** Projects exactly one runtime request against the latest private patch-history value. */
function projectRequest(request: RuntimePatchRequest, history: PatchHistory): Observable<WxHostCommand> {
    if (request.buildId !== history.buildId) {
        return of({ buildId: history.buildId, kind: 'materialize-full' })
    }
    if (!Number.isSafeInteger(request.version) || request.version < 0 || request.version > history.patches.length) {
        return of({ kind: 'run-full-build', reason: 'runtime-ahead-of-history' })
    }

    const patches = history.patches.slice(request.version)
    if (patches.length === 0) {
        return EMPTY
    }
    return of({
        kind: 'write-patches',
        projection: {
            buildId: history.buildId,
            fromVersion: request.version,
            patches,
            targetVersion: history.patches.length
        }
    })
}
