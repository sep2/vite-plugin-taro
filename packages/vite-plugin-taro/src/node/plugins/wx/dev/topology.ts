import { EMPTY, merge, type Observable, of } from 'rxjs'
import {
    distinctUntilChanged,
    filter,
    map,
    mergeMap,
    scan,
    share,
    shareReplay,
    startWith,
    switchMap,
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
    maximumPatchPerBuild: number
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
    options: WxHostTopologyOptions
): Observable<WxHostCommand> {
    if (!Number.isSafeInteger(options.maximumPatchPerBuild) || options.maximumPatchPerBuild < 1) {
        throw new RangeError('maximumPatchCount must be a positive safe integer.')
    }

    const sharedFacts = facts$.pipe(share())

    const patchHistory$ = createPatchHistory(sharedFacts, options)

    return createCommands(sharedFacts, patchHistory$, options).pipe(share())
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
function createPatchHistory(facts$: Observable<WxHostFact>, options: WxHostTopologyOptions): Observable<PatchHistory> {
    const successfulBuilds$ = factsOf(facts$, 'full-build-finished').pipe(
        map(({ result }) => result),
        filter((result): result is Extract<FullBuildResult, { ok: true }> => result.ok)
    )

    return successfulBuilds$.pipe(
        switchMap(({ buildId }) => {
            const history: PatchHistory = { buildId, patches: [] }

            return factsOf(facts$, 'patch-produced').pipe(
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
 * Projects runtime requests and every independent rebuild trigger into one command stream.
 *
 * A runtime request already at the current version produces EMPTY. That is normal steady state, not a protocol state.
 * Rebuild commands are emitted immediately; edge serialization, rather than topology feedback waiting, orders their
 * physical execution.
 */
function createCommands(
    facts$: Observable<WxHostFact>,
    patchHistory$: Observable<PatchHistory>,
    options: WxHostTopologyOptions
): Observable<WxHostCommand> {
    return merge(
        factsOf(facts$, 'runtime-requested').pipe(
            withLatestFrom(patchHistory$),
            mergeMap(([{ request }, history]) => projectRequest(request, history))
        ),
        factsOf(facts$, 'rebuild-requested').pipe(
            map(({ reason }): WxHostCommand => ({ kind: 'request-rebuild', reason }))
        ),
        patchHistory$.pipe(
            map((history) => history.patches.length >= options.maximumPatchPerBuild),
            distinctUntilChanged(),
            filter(Boolean),
            map((): WxHostCommand => ({ kind: 'request-rebuild', reason: 'history-limit' }))
        ),
        factsOf(facts$, 'patches-written').pipe(
            filter(({ ok }) => !ok),
            withLatestFrom(patchHistory$),
            filter(([{ buildId }, history]) => buildId === history.buildId),
            map((): WxHostCommand => ({ kind: 'request-rebuild', reason: 'patch-write-failed' }))
        ),
        factsOf(facts$, 'runtime-failed').pipe(
            withLatestFrom(patchHistory$),
            filter(([{ failure }, history]) => failure.buildId === history.buildId),
            map((): WxHostCommand => ({ kind: 'request-rebuild', reason: 'runtime-failed' }))
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
