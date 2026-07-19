import type { Observable } from 'rxjs'

/**
 * High-level HMR topology:
 *
 * ```text
 * build request → complete build epoch → retained patch history
 *                                           ▲          │
 *                                           │          │ missing range
 * WX runtime ← physical update.js ← publication from poll(applied version)
 *      │                                                               │
 *      └──────────── next poll(new applied version) ──────────────────┘
 * ```
 *
 * Safe DevEngine patches only extend the epoch-scoped history. A runtime poll is the only event that materializes
 * update.js. A complete-build or local rebuild boundary immediately ends the current epoch scope.
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

/** A successful complete physical baseline ready for runtime control and HMR history. */
export type BuildEpoch = Readonly<{
    /** Identity shared by this baseline, its patch history, and runtime control. */
    buildId: string
}>

/** One complete-build event. */
export type BuildEvent =
    | Readonly<{
          /** Complete physical build effect has begun; the previous epoch is no longer safe to use. */
          kind: 'build-started'
          request: BuildRequest
      }>
    | Readonly<{
          /** Complete output and bootstrap files are ready for runtime control. */
          epoch: BuildEpoch
          kind: 'build-ready'
      }>
    | Readonly<{
          /** Complete build or bootstrap materialization failed without producing an epoch. */
          error: unknown
          kind: 'build-failed'
          request: BuildRequest
      }>

/** A safe executable patch emitted by DevEngine for one active build epoch. */
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

/** A safe patch after append-only history assigns its version. */
export type RetainedPatch = Readonly<{
    /** Immutable DevEngine patch content. */
    patch: SafePatch
    /** Monotonic version within the current build epoch. */
    version: number
}>

/**
 * Append-only retained patch history for the current epoch.
 *
 * Its build identity is lexical: the stream exists only inside one `BuildEpoch`, so duplicating an ID here would create
 * an invalid state the topology cannot actually produce.
 */
export type PatchHistory = Readonly<{
    /** Ordered patch prefix beginning at version one. */
    patches: readonly RetainedPatch[]
}>

/** One control-channel report from the WX runtime. */
export type UpdatePoll = Readonly<{
    /** Build identity read from hmr/info.js. */
    buildId: string
    /** Identity of the WX JavaScript heap making this report. */
    clientId: string
    /** Highest contiguous patch version that completed runtime execution and React Refresh. */
    appliedVersion: number
}>

/** One poll-driven physical projection of a missing contiguous patch range. */
export type UpdatePublication = Readonly<{
    /** Build baseline allowed to execute this update. */
    buildId: string
    /** Active heap allowed to execute this update. */
    clientId: string
    /** Contiguous retained versions missing from the runtime's reported prefix. */
    patches: readonly RetainedPatch[]
    /** Unique materialization identity, including retries of the same missing range. */
    publicationId: number
}>

/** Result of attempting one atomic physical update.js materialization. */
export type UpdatePublicationResult =
    | Readonly<{
          /** Physical update.js was written and is ready for the WX page rerun. */
          kind: 'update-published'
          publication: UpdatePublication
      }>
    | Readonly<{
          /** The writer failed; the next runtime poll can retry without a timer. */
          error: unknown
          kind: 'update-write-failed'
          publication: UpdatePublication
      }>

/**
 * A local condition that has already stopped the active epoch and needs a fresh edge-created `BuildRequest`.
 *
 * The topology never creates build IDs. The DevHost edge maps this signal to a request with a new ID and feeds it back
 * into the build-request source.
 */
export type RebuildSignal = Readonly<{
    /** Epoch that became unsafe and was stopped. */
    buildId: string
    /** Distinguishes this local boundary from lifecycle and publication events. */
    kind: 'rebuild-needed'
    /** Reason for the replacement baseline. */
    reason: Exclude<BuildReason, 'initial'>
}>

/** One fact emitted while a successful build epoch is active. */
export type EpochEvent =
    | Readonly<{
          /** Retained patch history changed within its active epoch. */
          epoch: BuildEpoch
          history: PatchHistory
          kind: 'history-retained'
      }>
    | RebuildSignal
    | UpdatePublicationResult

/** One fact emitted by the complete pure topology. */
export type HmrEvent = BuildEvent | EpochEvent

/** Complete physical DevEngine build effect. */
export type CompleteBuildEffect = (request: BuildRequest) => Observable<void>

/**
 * Bootstrap materialization that follows a complete physical build.
 *
 * Endpoint and filesystem details belong to this edge: topology only establishes the build identity and ordering.
 */
export type WriteBootstrapEffect = (epoch: BuildEpoch) => Observable<void>

/**
 * Supplies safe patches for exactly one successful build epoch.
 *
 * A source error becomes a `rolldown-full-reload` rebuild signal, so it cannot tear down the shared topology stream.
 */
export type SafePatchSource = (epoch: BuildEpoch) => Observable<SafePatch>

/**
 * Atomically writes one poll-selected range into hmr/update.js.
 *
 * Unsubscription is a build boundary: the edge must ensure an unsubscribed write cannot later commit over the bootstrap
 * or update file of a replacement epoch.
 */
export type WritePublicationEffect = (publication: UpdatePublication) => Observable<void>
