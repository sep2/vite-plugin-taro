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
 * The only retained topology value is the current build's bounded patch history:
 *
 * ```text
 * full-build-finished ──▶ fresh history
 * patch-produced ───────▶ append patch
 * runtime-requested ────▶ write missing patches
 * failure / bad range ──▶ request rebuild
 * ```
 *
 * A rebuild is one edge operation: generate a fresh buildId, run DevEngine's complete output, then write hmr/info.js
 * and inert hmr/patches.js. The resulting full-build fact resets patch numbering to zero.
 */

export type RebuildReason =
    | 'history-limit'
    | 'initial'
    | 'patch-generation-failed'
    | 'patch-write-failed'
    | 'runtime-ahead-of-history'
    | 'runtime-build-mismatch'
    | 'runtime-failed'
    | 'source-requires-full-build'

/** An edge-created rebuild request. Every complete build gets a fresh identity. */
export type FullBuildRequest = Readonly<{
    buildId: string
    reason: RebuildReason
}>

/** Result of the one complete rebuild operation. */
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

/** All observations entering the topology from DevEngine, physical output, and runtime-control edges. */
export type WxHostFact =
    | Readonly<{ type: 'rebuild-requested'; reason: RebuildReason }>
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

/** The only host effects: rebuild the entire physical project or write one patch file. */
export type WxHostCommand =
    | Readonly<{ kind: 'request-rebuild'; reason: RebuildReason }>
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
type RuntimeRequestOutcome =
    | Readonly<{ kind: 'rebuild'; reason: RebuildReason }>
    | Readonly<{ kind: 'idle' }>
    | Readonly<{ kind: 'patches'; projection: PatchProjection }>

/**
 * Composes the stream branches below into one command stream. The fact bus remains the sole input boundary; helpers
 * split its logic for readability but neither subscribe nor perform effects.
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
    const runtimeOutcomes$ = createRuntimeOutcomes(factsOf(facts$, 'runtime-requested'), patchHistory$)
    const rebuildReasons$ = createRebuildReasons(facts$, patchHistory$, runtimeOutcomes$)

    return merge(
        createRebuildCommands(rebuildReasons$, fullBuildFinished$),
        createPatchWriteCommands(runtimeOutcomes$)
    ).pipe(share())
}

/** Selects one discriminated stream from the topology fact bus. */
function factsOf<Type extends WxHostFact['type']>(
    facts$: Observable<WxHostFact>,
    type: Type
): Observable<FactOf<Type>> {
    return facts$.pipe(filter((fact): fact is FactOf<Type> => fact.type === type))
}

/**
 * Maintains the sole private value: a bounded O(1)-append patch buffer.
 *
 * A successful rebuild replaces the entire switchMap branch. When capacity is reached, the buffer freezes until the
 * rebuild command completes; the limit transition itself becomes a rebuild reason below.
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

/** Projects each runtime request against the latest private patch history without retaining the runtime version. */
function createRuntimeOutcomes(
    runtimeRequested$: Observable<FactOf<'runtime-requested'>>,
    patchHistory$: Observable<PatchHistory>
): Observable<RuntimeRequestOutcome> {
    return runtimeRequested$.pipe(
        withLatestFrom(patchHistory$),
        map(([{ request }, history]) => projectRequest(request, history)),
        share()
    )
}

/** Merges every source that asks the host to replace the complete physical project. */
function createRebuildReasons(
    facts$: Observable<WxHostFact>,
    patchHistory$: Observable<PatchHistory>,
    runtimeOutcomes$: Observable<RuntimeRequestOutcome>
): Observable<RebuildReason> {
    return merge(
        factsOf(facts$, 'rebuild-requested').pipe(map(({ reason }) => reason)),
        patchHistory$.pipe(
            map((history) => history.limitReached),
            distinctUntilChanged(),
            filter(Boolean),
            map((): RebuildReason => 'history-limit')
        ),
        factsOf(facts$, 'patches-written').pipe(
            filter(({ ok }) => !ok),
            withLatestFrom(patchHistory$),
            filter(([{ buildId }, history]) => buildId === history.buildId),
            map((): RebuildReason => 'patch-write-failed')
        ),
        factsOf(facts$, 'runtime-failed').pipe(
            withLatestFrom(patchHistory$),
            filter(([{ failure }, history]) => failure.buildId === history.buildId),
            map((): RebuildReason => 'runtime-failed')
        ),
        runtimeOutcomes$.pipe(
            filter(
                (outcome): outcome is Extract<RuntimeRequestOutcome, { kind: 'rebuild' }> => outcome.kind === 'rebuild'
            ),
            map(({ reason }) => reason)
        )
    ).pipe(share())
}

/**
 * Coalesces rebuild requests declaratively.
 *
 * ```text
 * rebuild reason → request-rebuild command → await full-build-finished fact → next reason
 * ```
 */
function createRebuildCommands(
    rebuildReasons$: Observable<RebuildReason>,
    fullBuildFinished$: Observable<FactOf<'full-build-finished'>>
): Observable<WxHostCommand> {
    return rebuildReasons$.pipe(
        exhaustMap((reason) =>
            concat(
                of<WxHostCommand>({ kind: 'request-rebuild', reason }),
                fullBuildFinished$.pipe(take(1), ignoreElements())
            )
        )
    )
}

/** Converts valid runtime range projections into physical patch-file commands. */
function createPatchWriteCommands(runtimeOutcomes$: Observable<RuntimeRequestOutcome>): Observable<WxHostCommand> {
    return runtimeOutcomes$.pipe(
        filter((outcome): outcome is Extract<RuntimeRequestOutcome, { kind: 'patches' }> => outcome.kind === 'patches'),
        map(({ projection }): WxHostCommand => ({ kind: 'write-patches', projection }))
    )
}

/** Pure one-request range selection. */
function projectRequest(request: RuntimePatchRequest, history: PatchHistory): RuntimeRequestOutcome {
    if (request.buildId !== history.buildId) {
        return { kind: 'rebuild', reason: 'runtime-build-mismatch' }
    }
    if (!Number.isSafeInteger(request.version) || request.version < 0 || request.version > history.patches.length) {
        return { kind: 'rebuild', reason: 'runtime-ahead-of-history' }
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
