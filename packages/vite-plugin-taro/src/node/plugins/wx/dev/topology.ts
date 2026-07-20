import { EMPTY, merge, type Observable, of, take } from 'rxjs'
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

export type BuildReason =
    | 'patch-limit'
    | 'initial'
    | 'patch-generation-failed'
    | 'patch-write-failed'
    | 'runtime-ahead-of-history'
    | 'runtime-build-mismatch'
    | 'runtime-failed'
    | 'source-requires-full-build'

/** An edge-created rebuild request. Every complete build gets a fresh identity. */
export type BuildRequest = Readonly<{
    buildId: string
    reason: BuildReason
}>

/** Result of the one complete rebuild operation. */
export type FullBuildResult =
    | Readonly<{ buildId: string; ok: true }>
    | Readonly<{ buildId: string; error: unknown; ok: false }>

/** One Rolldown HMR program admitted into host history. */
export type HostPatch = Readonly<{
    code: string
    fileName: string
    sourcemap?: string
    sourcemapFileName?: string
}>

/** The current physical baseline and every HostPatch emitted after it. */
export type Build = {
    buildId: string
    patches: HostPatch[]
}

/** All observations entering the topology from DevEngine, physical output, and runtime-control edges. */
export type WxHostFact =
    | Readonly<{ type: 'rebuild-requested'; reason: BuildReason }>
    | Readonly<{ type: 'full-build-finished'; result: FullBuildResult }>
    | Readonly<{ type: 'patch-produced'; buildId: string; patch: HostPatch }>
    | Readonly<{
          type: 'patches-written'
          buildId: string
          fromVersion: number
          targetVersion: number
          ok: boolean
          error?: unknown
      }>
    | Readonly<{ type: 'runtime-requested'; buildId: string; version: number }>
    | Readonly<{ type: 'runtime-failed'; buildId: string; version: number; reason: string }>

/** The only host effects: rebuild the entire physical project or write one patch suffix. */
export type WxHostCommand =
    | Readonly<{ kind: 'request-rebuild'; reason: BuildReason }>
    | Readonly<{ kind: 'write-patches'; build: Build; fromVersion: number }>

type FactOf<Type extends WxHostFact['type']> = Extract<WxHostFact, { type: Type }>

export type WxHostTopologyOptions = Readonly<{
    maximumPatchPerBuild: number
}>

/**
 * Composes the stream branches below into one command stream. The fact bus remains the sole input boundary; helpers
 * split its logic for readability but neither subscribe nor perform effects.
 */
export function createWxHostTopology(
    facts$: Observable<WxHostFact>,
    options: WxHostTopologyOptions
): Observable<WxHostCommand> {
    if (!Number.isSafeInteger(options.maximumPatchPerBuild) || options.maximumPatchPerBuild < 1) {
        throw new RangeError('maximumPatchPerBuild must be a positive safe integer.')
    }

    const sharedFacts$ = facts$.pipe(share())
    const build$ = createBuild(sharedFacts$, options)

    return createCommands(sharedFacts$, build$, options).pipe(share())
}

/** Selects one discriminated stream from the topology fact bus. */
function factsOf<Type extends WxHostFact['type']>(
    facts$: Observable<WxHostFact>,
    type: Type
): Observable<FactOf<Type>> {
    return facts$.pipe(filter((fact): fact is FactOf<Type> => fact.type === type))
}

/**
 * Maintains the sole private value: an O(1)-append HostPatch buffer.
 *
 * A successful full-build result replaces the entire switchMap branch and releases its old buffer. Crossing the limit
 * emits one rebuild reason, but HostPatches continue to append while that rebuild runs.
 */
function createBuild(facts$: Observable<WxHostFact>, options: WxHostTopologyOptions): Observable<Build> {
    return factsOf(facts$, 'full-build-finished').pipe(
        map(({ result }) => result),
        filter((result): result is Extract<FullBuildResult, { ok: true }> => result.ok),
        switchMap(({ buildId }) => {
            const build: Build = { buildId, patches: [] }

            return factsOf(facts$, 'patch-produced').pipe(
                filter((fact) => fact.buildId === buildId),
                take(options.maximumPatchPerBuild),
                scan((current, { patch }) => {
                    current.patches.push(patch)
                    return current
                }, build),
                startWith(build)
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
    build$: Observable<Build>,
    options: WxHostTopologyOptions
): Observable<WxHostCommand> {
    return merge(
        factsOf(facts$, 'runtime-requested').pipe(
            withLatestFrom(build$),
            mergeMap(([request, build]) => projectRequest(request, build))
        ),
        factsOf(facts$, 'rebuild-requested').pipe(
            map(({ reason }): WxHostCommand => ({ kind: 'request-rebuild', reason }))
        ),
        build$.pipe(
            map((build) => build.patches.length >= options.maximumPatchPerBuild),
            distinctUntilChanged(),
            filter(Boolean),
            map((): WxHostCommand => ({ kind: 'request-rebuild', reason: 'patch-limit' }))
        ),
        factsOf(facts$, 'patches-written').pipe(
            filter(({ ok }) => !ok),
            withLatestFrom(build$),
            filter(([{ buildId }, build]) => buildId === build.buildId),
            map((): WxHostCommand => ({ kind: 'request-rebuild', reason: 'patch-write-failed' }))
        ),
        factsOf(facts$, 'runtime-failed').pipe(
            withLatestFrom(build$),
            filter(([{ buildId }, build]) => buildId === build.buildId),
            map((): WxHostCommand => ({ kind: 'request-rebuild', reason: 'runtime-failed' }))
        )
    )
}

/** Pure one-request range selection. A current runtime emits no command. */
function projectRequest(request: FactOf<'runtime-requested'>, build: Build): Observable<WxHostCommand> {
    if (request.buildId !== build.buildId) {
        return of({ kind: 'request-rebuild', reason: 'runtime-build-mismatch' })
    }
    if (!Number.isSafeInteger(request.version) || request.version < 0 || request.version > build.patches.length) {
        return of({ kind: 'request-rebuild', reason: 'runtime-ahead-of-history' })
    }
    if (request.version === build.patches.length) {
        return EMPTY
    }
    return of({ kind: 'write-patches', build, fromVersion: request.version })
}
