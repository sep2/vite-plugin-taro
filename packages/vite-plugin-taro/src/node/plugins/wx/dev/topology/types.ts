import type { Observable } from 'rxjs'

/**
 * High-level HMR topology:
 *
 * ```text
 * source edit → DevEngine safe patch → retained patch history ────────────────────────────────┐
 *                                                                                               │
 * WX runtime ── poll(applied version) ──> missing-range selection ──> physical update.js ──────┤
 *      ^                                                                                        │
 *      └──────── page rerun executes range ──> next poll(new applied version) ─────────────────┘
 * ```
 *
 * DevEngine updates history only. A runtime poll is the sole event that materializes update.js. HTTP carries build,
 * client, and version metadata; executable code reaches WX only through the physical project file.
 */

/**
 * Immutable metadata that marks a complete physical DevHost bootstrap.
 *
 * Every later topology branch receives the same value, so the runtime, patch history, and physical HMR files agree on
 * the full-build identity and local control endpoint.
 */
export type Bootstrap = Readonly<{
    /** Identity of the current complete physical build. */
    buildId: string
    /** Final local endpoint advertised through hmr/info.js. */
    endpoint: string
}>

/**
 * A safe executable patch emitted by the DevEngine edge.
 *
 * Unsafe source changes—native output changes, unaccepted boundaries, CSS, assets, and full-reload results—do not enter
 * this topology. Their edge requests a complete physical build instead.
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
    /** Monotonic version within the current full build. */
    version: number
}>

/**
 * The append-only patch history retained by the server since the current full build.
 *
 * This is stream state, not a DevHost field. A later full build creates a new history stream with version numbering reset
 * to zero because the new physical bundle already contains every earlier source change.
 */
export type PatchHistory = Readonly<{
    /** Build identity shared by every retained version. */
    buildId: string
    /** Ordered contiguous patch prefix beginning at version one. */
    patches: readonly RetainedPatch[]
}>

/**
 * One control-channel report from the active WX runtime.
 *
 * Repeating an old `appliedVersion` is intentional: it means the runtime has not executed the last physical publication,
 * so the same missing range must be materialized again with a new publication identity.
 */
export type UpdatePoll = Readonly<{
    /** Full-build identity read by the runtime from hmr/info.js. */
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
 * DevTools file event. The HMR writer embeds it in update.js so an identical missing range still changes file content.
 */
export type UpdatePublication = Readonly<{
    /** Immutable full-build metadata embedded in the physical update module. */
    bootstrap: Bootstrap
    /** Active heap allowed to execute this publication. */
    clientId: string
    /** Contiguous retained versions missing from the runtime's reported prefix. */
    patches: readonly RetainedPatch[]
    /** Unique projection identity for this physical write attempt. */
    publicationId: number
}>

/**
 * Pure edge contract used by client-driven update publication.
 *
 * The concrete edge atomically writes the range into hmr/update.js. It does not decide when to write; only a poll and
 * retained history can cause this topology to invoke it.
 */
export type UpdatePublicationEffect = (publication: UpdatePublication) => Observable<void>

/**
 * Pure edge contract used by bootstrap composition.
 *
 * The DevHost edge supplies cold/fact observables and the physical bootstrap writer; this topology decides their order
 * without importing Vite, Rolldown, or filesystem APIs.
 */
export type StartupEffects = Readonly<{
    /** First completed physical FullBuild emitted by the DevEngine edge. */
    initialEngineOutput$: Observable<void>
    /** Vite's final resolved local endpoint, emitted after HTTP listening begins. */
    listeningEndpoint$: Observable<string>
    /** Fatal preparation of the output directory and initial public files. */
    prepareOutput$: Observable<void>
    /** Effect that atomically writes hmr/info.js and inert hmr/update.js. */
    writeBootstrap(bootstrap: Bootstrap): Observable<void>
}>
