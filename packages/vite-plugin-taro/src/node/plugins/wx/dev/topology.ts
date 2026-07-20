import { merge, type Observable } from 'rxjs'
import { filter, map, scan, share, shareReplay, startWith, switchMap, withLatestFrom } from 'rxjs/operators'

/**
 * WX development host topology.
 *
 * The host retains only a build's append-only patch history. It does not retain runtime/session objects, a last runtime
 * version, pending requests, delivery acknowledgements, or an execution state. A runtime request carries all input
 * needed to project the current patch suffix.
 *
 * ```text
 * full-build result ──────┐
 *                          ▼
 * safe patches ─────▶ current patch-history$ ◀──── runtime request { buildId, version }
 *                          │                                      │
 *                          │                                      ▼
 *                          │                         patches[version..current]
 *                          │                                      │
 *                          ▼                                      ▼
 *                    materialize full                      write hmr/patches.js
 *                                                               │
 *                                                               ▼
 *                                                DevTools re-executes the page
 *                                                               │
 *                                             patches.js stores patch factories
 *                                                               │
 *                                            App runtime reconciles and reports
 * ```
 *
 * `hmr/patches.js` is delivery-only. It stores patch factories in the App-owned runtime and never executes them. The
 * runtime reconciles after synchronous page evaluation returns, then makes its next version request.
 *
 * A full build generates a new `buildId` and resets patch numbering to zero. It has no version of its own.
 */

/** Reasons that require a fresh complete physical WX build. */
export type FullBuildReason =
    | 'initial'
    | 'full-materialization-failed'
    | 'patch-generation-failed'
    | 'patch-write-failed'
    | 'runtime-ahead-of-history'
    | 'runtime-failed'
    | 'source-requires-full-build'

/** An edge-generated complete-build request. Its identity changes on every full build. */
export type FullBuildRequest = Readonly<{
    buildId: string
    reason: FullBuildReason
}>

/** The DevEngine edge's result for one complete physical build. */
export type FullBuildResult =
    | Readonly<{ buildId: string; ok: true }>
    | Readonly<{ buildId: string; error: unknown; ok: false }>

/** One safe, executable Rolldown patch. */
export type SafePatch = Readonly<{
    code: string
    fileName: string
    sourcemap?: string
    sourcemapFileName?: string
}>

/** A DevEngine patch is tied to the physical build that emitted it. */
export type ProducedPatch = Readonly<{
    buildId: string
    clientId: string
    patch: SafePatch
}>

/** A runtime request is complete range-selection input; the host never stores its version. */
export type RuntimePatchRequest = Readonly<{
    buildId: string
    clientId: string
    version: number
}>

/** A runtime error causes a complete rebuild, which lets DevTools destroy all old App state naturally. */
export type RuntimeFailure = Readonly<{
    buildId: string
    clientId: string
    reason: string
    version: number
}>

/** The exact contiguous physical patch file to write for one runtime request. */
export type PatchProjection = Readonly<{
    buildId: string
    fromVersion: number
    patches: readonly SafePatch[]
    targetVersion: number
}>

/** Identifies the current full baseline and the patches produced after it. This stays private to the stream graph. */
type PatchHistory = Readonly<{
    buildId: string
    patches: readonly SafePatch[]
}>

type Projection =
    | Readonly<{ kind: 'idle' }>
    | Readonly<{ kind: 'materialize-full'; buildId: string }>
    | Readonly<{ kind: 'patches'; projection: PatchProjection }>
    | Readonly<{ kind: 'runtime-ahead-of-history' }>

/** Inputs supplied by Vite/DevEngine, the control endpoint, and physical-output edges. */
export type WxHostTopologyInput = Readonly<{
    /** Initial startup plus unsafe source changes and DevEngine full-reload results. */
    fullBuildReasons$: Observable<FullBuildReason>
    /** Results from the complete-build edge. Failed builds are logged by that edge and produce no baseline. */
    fullBuildResults$: Observable<FullBuildResult>
    /** Safe Rolldown patches emitted after a complete build. */
    producedPatches$: Observable<ProducedPatch>
    /** Version reports from the persistent App runtime. */
    runtimeFailures$: Observable<RuntimeFailure>
    runtimeRequests$: Observable<RuntimePatchRequest>
    /** Physical-output failures are terminal for the current build and require a new full build. */
    fullMaterializationFailures$: Observable<Readonly<{ buildId: string }>>
    patchesWriteFailures$: Observable<Readonly<{ buildId: string }>>
}>

/**
 * Effect streams selected by the topology. They are intentionally specific operations rather than a generic command
 * language: the DevHost wires each stream directly to its corresponding edge.
 */
export type WxHostTopology = Readonly<{
    /** Reasons for the DevEngine edge to create a fresh build ID and run a complete build. */
    fullBuildReasons$: Observable<FullBuildReason>
    /** Complete physical baselines to materialize after a successful full build or stale runtime request. */
    fullMaterializations$: Observable<Readonly<{ buildId: string }>>
    /** Contiguous suffixes to render and direct-close-write into hmr/patches.js. */
    patchProjections$: Observable<PatchProjection>
}>

/**
 * Creates the complete host stream graph.
 *
 * ```text
 *                     fullBuildResults$
 *                           │ switchMap resets history
 *                           ▼
 * producedPatches$ → scan(append patch) → patchHistory$ ─┐
 *                                                         ├─ runtime requests → projections
 * runtime failures / invalid projections / write failures ┘
 *                           │
 *                           ▼
 *                    fullBuildReasons$
 * ```
 *
 * No stream here performs filesystem, HTTP, DevEngine, or timer work. Consumers execute the three returned effect
 * streams and feed their concrete results back through the input observables.
 */
export function createWxHostTopology(input: WxHostTopologyInput): WxHostTopology {
    const successfulBuilds$ = input.fullBuildResults$.pipe(
        filter((result): result is Extract<FullBuildResult, { ok: true }> => result.ok),
        share()
    )

    // Every successful full build replaces the baseline and starts a fresh patch sequence at version zero.
    const patchHistory$ = successfulBuilds$.pipe(
        switchMap(({ buildId }) =>
            input.producedPatches$.pipe(
                filter((patch) => patch.buildId === buildId),
                map((patch) => patch.patch),
                scan((patches, patch) => [...patches, patch] as readonly SafePatch[], [] as readonly SafePatch[]),
                startWith([] as readonly SafePatch[]),
                map((patches): PatchHistory => ({ buildId, patches }))
            )
        ),
        shareReplay({ bufferSize: 1, refCount: true })
    )

    const projections$ = input.runtimeRequests$.pipe(
        withLatestFrom(patchHistory$),
        map(([request, history]): Projection => projectPatches(history, request)),
        share()
    )

    const fullBuildReasons$ = merge(
        input.fullBuildReasons$,
        projections$.pipe(
            filter(
                (projection): projection is Extract<Projection, { kind: 'runtime-ahead-of-history' }> =>
                    projection.kind === 'runtime-ahead-of-history'
            ),
            map((): FullBuildReason => 'runtime-ahead-of-history')
        ),
        input.runtimeFailures$.pipe(
            withLatestFrom(patchHistory$),
            filter(([failure, history]) => failure.buildId === history.buildId),
            map((): FullBuildReason => 'runtime-failed')
        ),
        input.fullMaterializationFailures$.pipe(
            withLatestFrom(patchHistory$),
            filter(([failure, history]) => failure.buildId === history.buildId),
            map((): FullBuildReason => 'full-materialization-failed')
        ),
        input.patchesWriteFailures$.pipe(
            withLatestFrom(patchHistory$),
            filter(([failure, history]) => failure.buildId === history.buildId),
            map((): FullBuildReason => 'patch-write-failed')
        )
    ).pipe(share())

    return {
        fullBuildReasons$,
        fullMaterializations$: merge(
            successfulBuilds$.pipe(map(({ buildId }) => ({ buildId }))),
            projections$.pipe(
                filter(
                    (projection): projection is Extract<Projection, { kind: 'materialize-full' }> =>
                        projection.kind === 'materialize-full'
                ),
                map(({ buildId }) => ({ buildId }))
            )
        ).pipe(share()),
        patchProjections$: projections$.pipe(
            filter(
                (projection): projection is Extract<Projection, { kind: 'patches' }> => projection.kind === 'patches'
            ),
            map(({ projection }) => projection),
            share()
        )
    }
}

/** Selects a full baseline or the exact missing patch suffix from one stateless runtime request. */
function projectPatches(history: PatchHistory, request: RuntimePatchRequest): Projection {
    if (request.buildId !== history.buildId) {
        return { buildId: history.buildId, kind: 'materialize-full' }
    }
    if (!Number.isSafeInteger(request.version) || request.version < 0 || request.version > history.patches.length) {
        return { kind: 'runtime-ahead-of-history' }
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
