import { concat, EMPTY, merge, type Observable, of } from 'rxjs'
import {
    distinctUntilChanged,
    exhaustMap,
    filter,
    ignoreElements,
    map,
    mergeMap,
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
 * The only retained topology value is the current build's patch history:
 *
 * ```text
 * full-build-finished ──▶ fresh history
 * patch-produced ───────▶ append patch
 * runtime-requested ────▶ write missing patches
 * failure / bad range ──▶ request rebuild
 * ```
 *
 * A rebuild is one edge operation: generate a fresh buildId, run DevEngine's complete output, then write hmr/info.js
 * and inert hmr/patches.js. The resulting full-build fact resets patch numbering to zero. Reaching the retained-history
 * limit requests this rebuild once, but does not stop later patches from appending while it runs.
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

type FactOf<Type extends WxHostFact['type']> = Extract<WxHostFact, { type: Type }>

export type WxHostTopologyOptions = Readonly<{
    maximumPatchCount?: number
}>

type PatchHistory = {
    buildId: string
    patches: SafePatch[]
}

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
    const patchHistory$ = createPatchHistory(factsOf(facts$, 'patch-produced'), fullBuildFinished$)
    const runtimeCommands$ = createRuntimeCommands(factsOf(facts$, 'runtime-requested'), patchHistory$)
    const rebuildReasons$ = createRebuildReasons(facts$, patchHistory$, runtimeCommands$, maximumPatchCount)

    return merge(
        createRebuildCommands(rebuildReasons$, fullBuildFinished$),
        createPatchWriteCommands(runtimeCommands$)
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
 * Maintains the sole private value: an O(1)-append patch buffer.
 *
 * A successful full-build result replaces the entire switchMap branch and releases its old buffer. Crossing the limit
 * emits one rebuild reason, but patches continue to append while that rebuild runs.
 */
function createPatchHistory(
    patchProduced$: Observable<FactOf<'patch-produced'>>,
    fullBuildFinished$: Observable<FactOf<'full-build-finished'>>
): Observable<PatchHistory> {
    const successfulBuilds$ = fullBuildFinished$.pipe(
        map(({ result }) => result),
        filter((result): result is Extract<FullBuildResult, { ok: true }> => result.ok)
    )

    return successfulBuilds$.pipe(
        switchMap(({ buildId }) => {
            const history: PatchHistory = { buildId, patches: [] }

            return patchProduced$.pipe(
                filter(({ patch }) => patch.buildId === buildId),
                scan((current, { patch }) => {
                    current.patches.push(patch.patch)
                    return current
                }, history),
                startWith(history)
            )
        }),
        shareReplay({ bufferSize: 1, refCount: true })
    )
}

/**
 * Projects each runtime request against the latest private patch history without retaining the runtime version.
 *
 * A request already at the current version produces EMPTY. That is normal steady state, not a protocol state.
 */
function createRuntimeCommands(
    runtimeRequested$: Observable<FactOf<'runtime-requested'>>,
    patchHistory$: Observable<PatchHistory>
): Observable<WxHostCommand> {
    return runtimeRequested$.pipe(
        withLatestFrom(patchHistory$),
        mergeMap(([{ request }, history]) => projectRequest(request, history)),
        share()
    )
}

/** Merges every source that asks the host to replace the complete physical project. */
function createRebuildReasons(
    facts$: Observable<WxHostFact>,
    patchHistory$: Observable<PatchHistory>,
    runtimeCommands$: Observable<WxHostCommand>,
    maximumPatchCount: number
): Observable<RebuildReason> {
    return merge(
        factsOf(facts$, 'rebuild-requested').pipe(map(({ reason }) => reason)),
        patchHistory$.pipe(
            map((history) => history.patches.length >= maximumPatchCount),
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
        runtimeCommands$.pipe(
            filter(
                (command): command is Extract<WxHostCommand, { kind: 'request-rebuild' }> =>
                    command.kind === 'request-rebuild'
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

/** Rebuild commands are coalesced above; this branch retains only physical patch writes. */
function createPatchWriteCommands(runtimeCommands$: Observable<WxHostCommand>): Observable<WxHostCommand> {
    return runtimeCommands$.pipe(
        filter(
            (command): command is Extract<WxHostCommand, { kind: 'write-patches' }> => command.kind === 'write-patches'
        )
    )
}

/** Pure one-request range selection. A current runtime emits no command. */
function projectRequest(request: RuntimePatchRequest, history: PatchHistory): Observable<WxHostCommand> {
    if (request.buildId !== history.buildId) {
        return of({ kind: 'request-rebuild', reason: 'runtime-build-mismatch' })
    }
    if (!Number.isSafeInteger(request.version) || request.version < 0 || request.version > history.patches.length) {
        return of({ kind: 'request-rebuild', reason: 'runtime-ahead-of-history' })
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
