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
 * A full build is one edge operation: create a fresh buildId, let DevEngine write complete output, then write
 * hmr/info.js and inert hmr/patches.js. It starts patch numbering at zero and has no version of its own.
 *
 * ```text
 * full-build result ──▶ private bounded patch history
 *                                 │
 * runtime version request ───────┼──▶ write missing hmr/patches.js range
 *                                 │
 * failures / limit / bad version ┴──▶ run one complete build
 * ```
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

/** DevEngine patch provenance. The client ID is not retained as host runtime/session state. */
export type ProducedPatch = Readonly<{
    buildId: string
    clientId: string
    patch: SafePatch
}>

/** A complete stateless version report from the persistent App runtime. */
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

/** One contiguous suffix rendered into physical hmr/patches.js. */
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

type FactOf<Type extends WxHostFact['type']> = Extract<WxHostFact, { type: Type }>
type PatchHistory = {
    buildId: string
    limitReached: boolean
    patches: SafePatch[]
}
type RuntimeRequestEffect =
    | Readonly<{ kind: 'full-build'; reason: FullBuildReason }>
    | Readonly<{ kind: 'idle' }>
    | Readonly<{ kind: 'patches'; projection: PatchProjection }>

/**
 * Composes the named stream branches below into the one topology command stream.
 *
 * The fact bus remains the sole input boundary. Helpers only split its logic into readable flows; none subscribes or
 * performs effects.
 */
export function createWxHostTopology(
    facts$: Observable<WxHostFact>,
    { maximumPatchCount = 100 }: WxHostTopologyOptions = {}
): Observable<WxHostCommand> {
    if (!Number.isSafeInteger(maximumPatchCount) || maximumPatchCount < 1) {
        throw new RangeError('maximumPatchCount must be a positive safe integer.')
    }

    const fullBuildFinished$ = factsOf(facts$, 'full-build-finished').pipe(share())
    const patchHistory$ = createPatchHistory(factsOf(facts$, 'patch-produced'), fullBuildFinished$, maximumPatchCount)
    const runtimeEffects$ = createRuntimeRequestEffects(factsOf(facts$, 'runtime-requested'), patchHistory$)
    const fullBuildReasons$ = createFullBuildReasons(facts$, patchHistory$, runtimeEffects$)

    return merge(
        createFullBuildCommands(fullBuildReasons$, fullBuildFinished$),
        createPatchWriteCommands(runtimeEffects$)
    ).pipe(share())
}

/** Selects one discriminated fact stream from the topology input bus. */
function factsOf<Type extends WxHostFact['type']>(
    facts$: Observable<WxHostFact>,
    type: Type
): Observable<FactOf<Type>> {
    return facts$.pipe(filter((fact): fact is FactOf<Type> => fact.type === type))
}

/**
 * Maintains the sole private topology value: the current build's bounded append-only patch buffer.
 *
 * ```text
 * successful full build → replace buffer
 * matching patch        → O(1) append
 * limit reached         → freeze buffer until next full build
 * ```
 */
function createPatchHistory(
    patchProduced$: Observable<FactOf<'patch-produced'>>,
    fullBuildFinished$: Observable<FactOf<'full-build-finished'>>,
    maximumPatchCount: number
): Observable<PatchHistory> {
    const successfulBuilds$ = fullBuildFinished$.pipe(
        map(({ result }) => result),
        filter((result): result is Extract<FullBuildResult, { ok: true }> => result.ok)
    )

    return successfulBuilds$.pipe(
        switchMap(({ buildId }) => {
            const history: PatchHistory = { buildId, limitReached: false, patches: [] }
            return patchProduced$.pipe(
                filter(({ patch }) => patch.buildId === buildId),
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
}

/**
 * Projects each stateless runtime request against the latest retained history.
 *
 * No runtime version is saved after this projection. Repeated requests therefore independently select the same suffix.
 */
function createRuntimeRequestEffects(
    runtimeRequested$: Observable<FactOf<'runtime-requested'>>,
    patchHistory$: Observable<PatchHistory>
): Observable<RuntimeRequestEffect> {
    return runtimeRequested$.pipe(
        withLatestFrom(patchHistory$),
        map(([{ request }, history]) => projectRequest(request, history)),
        share()
    )
}

/**
 * Merges every terminal condition that requires a new complete build.
 *
 * The history-limit branch emits once per build because the boolean transition is observed through
 * `distinctUntilChanged()`.
 */
function createFullBuildReasons(
    facts$: Observable<WxHostFact>,
    patchHistory$: Observable<PatchHistory>,
    runtimeEffects$: Observable<RuntimeRequestEffect>
): Observable<FullBuildReason> {
    return merge(
        factsOf(facts$, 'full-build-requested').pipe(map(({ reason }) => reason)),
        patchHistory$.pipe(
            map((history) => history.limitReached),
            distinctUntilChanged(),
            filter(Boolean),
            map((): FullBuildReason => 'history-limit')
        ),
        factsOf(facts$, 'patches-written').pipe(
            filter(({ ok }) => !ok),
            withLatestFrom(patchHistory$),
            filter(([{ buildId }, history]) => buildId === history.buildId),
            map((): FullBuildReason => 'patch-write-failed')
        ),
        factsOf(facts$, 'runtime-failed').pipe(
            withLatestFrom(patchHistory$),
            filter(([{ failure }, history]) => failure.buildId === history.buildId),
            map((): FullBuildReason => 'runtime-failed')
        ),
        runtimeEffects$.pipe(
            filter(
                (effect): effect is Extract<RuntimeRequestEffect, { kind: 'full-build' }> =>
                    effect.kind === 'full-build'
            ),
            map(({ reason }) => reason)
        )
    ).pipe(share())
}

/**
 * Coalesces full-build reasons without a mutable DevHost flag.
 *
 * ```text
 * reason → run-full-build command → await full-build-finished fact → next reason
 * ```
 */
function createFullBuildCommands(
    fullBuildReasons$: Observable<FullBuildReason>,
    fullBuildFinished$: Observable<FactOf<'full-build-finished'>>
): Observable<WxHostCommand> {
    return fullBuildReasons$.pipe(
        exhaustMap((reason) =>
            concat(
                of<WxHostCommand>({ kind: 'run-full-build', reason }),
                fullBuildFinished$.pipe(take(1), ignoreElements())
            )
        )
    )
}

/** Converts successful runtime range projections into physical patch-file commands. */
function createPatchWriteCommands(runtimeEffects$: Observable<RuntimeRequestEffect>): Observable<WxHostCommand> {
    return runtimeEffects$.pipe(
        filter((effect): effect is Extract<RuntimeRequestEffect, { kind: 'patches' }> => effect.kind === 'patches'),
        map(({ projection }): WxHostCommand => ({ kind: 'write-patches', projection }))
    )
}

/** Pure one-request range selection. */
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
