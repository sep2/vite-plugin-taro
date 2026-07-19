import type { Observable } from 'rxjs'

/**
 * Pure WX HMR topology:
 *
 * ```text
 * facts ──> topology ──> commands ──> edge consumers
 *   ▲                                      │
 *   └──────────── operation results ───────┘
 * ```
 *
 * The topology owns ordering, epoch lifetime, client ownership, retained history, and missing-range selection. It never
 * invokes DevEngine, HTTP, filesystem, ID generation, or any other effect.
 */

/** Why the DevHost must create a fresh complete physical WX baseline. */
export type BuildReason =
    | 'initial'
    | 'client-changed'
    | 'history-limit'
    | 'native-output-changed'
    | 'patch-execution-failed'
    | 'rolldown-full-reload'
    | 'runtime-desynchronized'

/** An edge-created request for one complete physical WX baseline. */
export type BuildRequest = Readonly<{
    /** Fresh identity for the baseline this request will produce. */
    buildId: string
    /** Source of the complete-build boundary. */
    reason: BuildReason
}>

/** A successful physical baseline whose bootstrap materialization also completed. */
export type BuildEpoch = Readonly<{
    buildId: string
}>

/** Result fact produced by the complete-build edge. */
export type CompleteBuildResult =
    | Readonly<{
          buildId: string
          ok: true
      }>
    | Readonly<{
          buildId: string
          error: unknown
          ok: false
      }>

/** Result fact produced by the bootstrap writer edge. */
export type BootstrapWriteResult =
    | Readonly<{
          buildId: string
          ok: true
      }>
    | Readonly<{
          buildId: string
          error: unknown
          ok: false
      }>

/** A safe executable patch emitted as a fact by the DevEngine edge. */
export type SafePatch = Readonly<{
    /** JavaScript patch body emitted by Rolldown. */
    code: string
    /** Source filename retained for diagnostics and source-map rendering. */
    fileName: string
    /** Optional Rolldown source-map body. */
    sourcemap?: string
    /** Optional filename associated with the source-map body. */
    sourcemapFileName?: string
}>

/** One safe-patch fact correlated to the physical baseline that produced it. */
export type SafePatchFact = Readonly<{
    buildId: string
    clientId: string
    patch: SafePatch
}>

/** A safe patch after append-only history assigns its epoch-local version. */
export type RetainedPatch = Readonly<{
    patch: SafePatch
    version: number
}>

/** Append-only retained patch history for one lexical build epoch. */
export type PatchHistory = Readonly<{
    /** Ordered patch prefix beginning at version one. */
    patches: readonly RetainedPatch[]
}>

/** One control-channel fact reported by a WX runtime. */
export type UpdatePoll = Readonly<{
    /** Build identity read from hmr/info.js. */
    buildId: string
    /** Identity of the WX JavaScript heap making this report. */
    clientId: string
    /** Edge-created identity of the one outstanding HTTP poll. */
    requestId: string
    /** Highest contiguous patch version that completed runtime execution and React Refresh. */
    appliedVersion: number
}>

/** One physical projection of a contiguous missing patch range. */
export type UpdatePublication = Readonly<{
    /** Build baseline allowed to execute this update. */
    buildId: string
    /** Active heap allowed to execute this update. */
    clientId: string
    /** Contiguous retained versions missing from the runtime's reported prefix. */
    patches: readonly RetainedPatch[]
    /** Unique materialization identity, including retries of the same missing range. */
    publicationId: number
    /** Control request completed by this physical materialization. */
    requestId: string
}>

/** Result fact produced by the atomic update.js writer edge. */
export type UpdateWriteResult =
    | Readonly<{
          buildId: string
          ok: true
          publicationId: number
          requestId: string
      }>
    | Readonly<{
          buildId: string
          error: unknown
          ok: false
          publicationId: number
          requestId: string
      }>

/** Runs one complete physical DevEngine build. */
export type RunBuildCommand = Readonly<{
    kind: 'run-build'
    request: BuildRequest
}>

/** Materializes hmr/info.js and inert hmr/update.js after complete output exists. */
export type WriteBootstrapCommand = Readonly<{
    epoch: BuildEpoch
    kind: 'write-bootstrap'
}>

/** Atomically materializes one poll-selected range into physical hmr/update.js. */
export type WriteUpdateCommand = Readonly<{
    kind: 'write-update'
    publication: UpdatePublication
}>

/**
 * Requests a fresh build identity and `BuildRequest` from the DevHost edge.
 *
 * Emitting this command immediately ends the active epoch; the topology does not wait for the edge to feed the new
 * request back into `buildRequests$`.
 */
export type RequestRebuildCommand = Readonly<{
    /** Epoch that became unsafe and was stopped. */
    buildId: string
    kind: 'request-rebuild'
    reason: Exclude<BuildReason, 'initial'>
}>

/** The complete output language consumed by effectful edges. */
export type HmrCommand = RunBuildCommand | WriteBootstrapCommand | WriteUpdateCommand | RequestRebuildCommand

/** Immutable input facts for the complete pure HMR topology. */
export type HmrFacts = Readonly<{
    /** Initial and edge-created replacement build requests. */
    buildRequests$: Observable<BuildRequest>
    /** Complete-build operation results. */
    completeBuildResults$: Observable<CompleteBuildResult>
    /** Bootstrap writer operation results. */
    bootstrapWriteResults$: Observable<BootstrapWriteResult>
    /** Safe DevEngine patches from all build epochs. */
    safePatches$: Observable<SafePatchFact>
    /** Runtime control reports from every connected WX heap. */
    polls$: Observable<UpdatePoll>
    /** Physical update.js writer operation results. */
    updateWriteResults$: Observable<UpdateWriteResult>
}>
