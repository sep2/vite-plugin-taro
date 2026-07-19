import type { Observable } from 'rxjs'

/**
 * High-level HMR topology:
 *
 * ```text
 * rebuild request → complete build epoch → retained patch history
 *                                              ▲          │
 *                                              │          │ missing range
 * WX runtime ← physical update.js ← publication from poll(applied version)
 *      │                                                                  │
 *      └────────── next poll(new applied version) ───────────────────────┘
 * ```
 *
 * DevEngine safe patches append only to history. A runtime poll is the sole event that materializes update.js. A new
 * complete build ends the prior epoch, clears its history, and establishes a fresh build ID and version-zero baseline.
 */

/** Why a complete physical build epoch is required. */
export type BuildReason =
    | 'initial'
    | 'client-changed'
    | 'history-limit'
    | 'native-output-changed'
    | 'patch-execution-failed'
    | 'rolldown-full-reload'

/**
 * An edge-created request for one complete physical WX baseline.
 *
 * The edge creates a fresh build ID before entering the topology. This makes version zero and retained patch history
 * unambiguous after every full build, even while the DevHost process itself remains alive.
 */
export type BuildRequest = Readonly<{
    /** Fresh identity for the complete physical baseline this request will produce. */
    buildId: string
    /** Final Vite local control endpoint that the new hmr/info.js will advertise. */
    endpoint: string
    /** Source of the rebuild boundary. */
    reason: BuildReason
}>

/** A successful complete physical baseline ready for runtime control and HMR history. */
export type BuildEpoch = Readonly<{
    /** Identity shared by this baseline, its patch history, and every runtime poll. */
    buildId: string
    /** Local control endpoint written into this baseline's hmr/info.js. */
    endpoint: string
}>

/** A complete build request that failed without producing a new usable epoch. */
export type BuildFailure = Readonly<{
    /** Error from the complete build or bootstrap effect. */
    error: unknown
    /** Request that failed. */
    request: BuildRequest
}>

/** One value emitted by the serialized full-build lifetime. */
export type BuildLifecycle =
    | Readonly<{
          /** Request whose complete build effect has begun. */
          request: BuildRequest
          kind: 'started'
      }>
    | Readonly<{
          /** Request whose complete output and bootstrap files are ready. */
          epoch: BuildEpoch
          kind: 'succeeded'
      }>
    | Readonly<{
          /** Request whose complete build or bootstrap effect failed. */
          failure: BuildFailure
          kind: 'failed'
      }>

/**
 * A safe executable patch emitted by the DevEngine edge for one active build epoch.
 *
 * Native-output changes, unaccepted boundaries, CSS, assets, and full-reload results do not enter this type; their edge
 * creates a `BuildRequest` instead.
 */
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

/** A safe patch after append-only history has assigned its version. */
export type RetainedPatch = Readonly<{
    /** Immutable DevEngine patch content. */
    patch: SafePatch
    /** Monotonic version within the current build epoch. */
    version: number
}>

/**
 * The append-only patch history retained by the server for one successful build epoch.
 *
 * This is stream state, not a DevHost field. A later successful epoch starts a new history with no retained patches.
 */
export type PatchHistory = Readonly<{
    /** Build epoch that owns this contiguous patch prefix. */
    buildId: string
    /** Ordered patch prefix beginning at version one. */
    patches: readonly RetainedPatch[]
}>

/** One build-scoped history value emitted by the complete topology. */
export type EpochHistory = Readonly<{
    /** Successful baseline that owns this history stream. */
    epoch: BuildEpoch
    /** Current retained patch prefix for that baseline. */
    history: PatchHistory
}>

/**
 * Signal that the current epoch has retained its configured maximum number of patches.
 *
 * The DevHost edge converts this fact into a fresh `BuildRequest` with reason `history-limit`; the topology itself never
 * generates build IDs or mutates the request source.
 */
export type HistoryLimitReached = Readonly<{
    /** Epoch whose retained history reached the configured bound. */
    epoch: BuildEpoch
    /** History value at the bound. */
    history: PatchHistory
}>

/**
 * One control-channel report from the active WX runtime.
 *
 * Repeating an old `appliedVersion` is intentional: it means the runtime has not executed the previous physical
 * publication, so the same missing range must be materialized again with a new publication identity.
 */
export type UpdatePoll = Readonly<{
    /** Build epoch identity read by the runtime from hmr/info.js. */
    buildId: string
    /** Identity of the active WX JavaScript heap. */
    clientId: string
    /** Highest contiguous patch version that completed runtime execution and React Refresh. */
    appliedVersion: number
}>

/**
 * One client-driven physical projection of a contiguous range from retained history.
 *
 * `publicationId` changes for every poll-driven materialization, including republishing the same versions after a missed
 * DevTools file event. The HMR writer embeds it in update.js so identical missing ranges still change file content.
 */
export type UpdatePublication = Readonly<{
    /** Successful baseline metadata embedded in the physical update module. */
    epoch: BuildEpoch
    /** Active heap allowed to execute this publication. */
    clientId: string
    /** Contiguous retained versions missing from the runtime's reported prefix. */
    patches: readonly RetainedPatch[]
    /** Unique projection identity for this physical write attempt. */
    publicationId: number
}>

/** One build-scoped publication value emitted by the complete topology. */
export type EpochPublication = Readonly<{
    /** Successful baseline that owns this publication. */
    epoch: BuildEpoch
    /** Poll-driven physical update projection. */
    publication: UpdatePublication
}>

/**
 * Edge contract for one complete physical build.
 *
 * The effect completes only after DevEngine has written the complete baseline. It may prepare initial public output for
 * an `initial` request, or trigger and observe a later DevEngine FullBuild for any other request.
 */
export type CompleteBuildEffect = (request: BuildRequest) => Observable<void>

/**
 * Edge contract for bootstrap materialization after complete output exists.
 *
 * The effect writes hmr/info.js and inert hmr/update.js for the new build epoch before that epoch becomes observable to
 * runtime control and patch-history streams.
 */
export type WriteBootstrapEffect = (epoch: BuildEpoch) => Observable<void>

/**
 * Edge contract that supplies safe patches for exactly one successful build epoch.
 *
 * The returned stream ends when the topology leaves that epoch. The concrete DevEngine edge filters stale output and
 * routes unsafe update results into fresh build requests instead.
 */
export type SafePatchSource = (epoch: BuildEpoch) => Observable<SafePatch>

/**
 * Edge contract used by client-driven update publication.
 *
 * The concrete edge atomically writes the range into hmr/update.js. It does not decide when to write; only a poll and
 * retained history can cause this topology to invoke it.
 */
export type WritePublicationEffect = (publication: UpdatePublication) => Observable<void>

/** One build-scoped value emitted while a successful epoch is active. */
export type EpochTopologyValue =
    | Readonly<{
          /** Updated retained history for the current epoch. */
          value: EpochHistory
          kind: 'history'
      }>
    | Readonly<{
          /** Retained history reached its configured bound. */
          value: HistoryLimitReached
          kind: 'history-limit'
      }>
    | Readonly<{
          /** Runtime-poll-driven physical update projection completed writing. */
          value: EpochPublication
          kind: 'publication'
      }>

/**
 * Observable outputs of the complete pure HMR topology.
 *
 * The DevHost edge subscribes to these streams and turns failures/history limits into logging or fresh build requests.
 * None of these values contains a host object or mutable session handle.
 */
export type HmrTopology = Readonly<{
    /** Serialized complete-build start, success, and failure facts. */
    builds$: Observable<BuildLifecycle>
    /** Successful baseline values; each begins a new patch-history lifetime. */
    epochs$: Observable<BuildEpoch>
    /** Complete-build failures; initial failure is fatal while later failures are recoverable edge policy. */
    failures$: Observable<BuildFailure>
    /** Replayed history changes scoped to the currently successful epoch. */
    histories$: Observable<EpochHistory>
    /** Bound-reached signals the edge converts into a fresh history-limit build request. */
    historyLimits$: Observable<HistoryLimitReached>
    /** Poll-driven physical update.js projections scoped to the current epoch. */
    publications$: Observable<EpochPublication>
}>
