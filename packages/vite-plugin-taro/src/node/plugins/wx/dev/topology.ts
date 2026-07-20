/**
 * The pure host topology for WX development updates.
 *
 * A full build establishes a new `buildId` and a zero-length patch history. Patch versions are therefore scoped to a
 * build, but a full build is not itself a versioned update. The topology deliberately retains no runtime/session
 * object and no last-reported runtime version: each runtime request is sufficient to project the current history.
 *
 * ```text
 *                                  ┌─────────────────────┐
 * DevEngine safe patch ───────────▶│ append patch history │
 *                                  └──────────┬──────────┘
 *                                             │ current build + request version
 * runtime request { buildId, version } ───────┼──────────────────────┐
 *                                             ▼                      │
 *                                      select missing range           │
 *                                             │                      │
 *                                             ▼                      │
 *                                      write hmr/patches.js           │
 *                                             │                      │
 *                                             ▼                      │
 *                              DevTools re-executes the page          │
 *                                             │                      │
 *                             patches.js stores its factories         │
 *                                             │                      │
 *                             App runtime reconciles and reports ─────┘
 *
 * unsafe source change / runtime failure / impossible version / write failure
 *                                             │
 *                                             ▼
 *                                      run full build
 *                                             │
 *                                             ▼
 *                            new buildId + empty patch history
 * ```
 *
 * Host state itself has only one physical-baseline lifecycle:
 *
 * ```text
 * empty ── full build requested ──▶ building ── build ready ──▶ ready(buildId, patches)
 *   ▲                                  ▲                            │
 *   └──── full build failed ───────────┴──── any terminal fault ─────┘
 * ```
 *
 * `hmr/patches.js` is delivery-only. It calls the persistent App runtime to store a patch factory; it never applies
 * the factory itself. The App runtime reconciles after the synchronous page evaluation that required patches.js has
 * returned, then sends its new version in the next request.
 */

/** A safe Rolldown patch retained in append-only host history. */
export type WxSafePatch = Readonly<{
    code: string
    fileName: string
    sourcemap?: string
    sourcemapFileName?: string
}>

/** A patch receives its version from its position after the current build's physical baseline. */
export type WxRetainedPatch = Readonly<{
    patch: WxSafePatch
    version: number
}>

/** The only durable host state for a successfully materialized full build. */
export type WxCurrentBuild = Readonly<{
    buildId: string
    patches: readonly WxRetainedPatch[]
}>

/**
 * The topology has no runtime state. `building` only prevents patches from a superseded physical baseline from
 * entering the next build's history while the full-build edge is running.
 */
export type WxHostState =
    | Readonly<{ kind: 'empty' }>
    | Readonly<{ kind: 'building' }>
    | Readonly<{ build: WxCurrentBuild; kind: 'ready' }>

/** Why the host must replace the complete physical WX project. */
export type WxFullBuildReason =
    | 'initial'
    | 'patch-generation-failed'
    | 'patch-write-failed'
    | 'runtime-ahead-of-history'
    | 'runtime-failed'
    | 'source-requires-full-build'
    | 'full-materialization-failed'

/** Facts enter the topology from the DevEngine, physical writer, and runtime control edge. */
export type WxHostFact =
    | Readonly<{ type: 'full-build-required'; reason: WxFullBuildReason }>
    | Readonly<{ type: 'full-build-ready'; buildId: string }>
    | Readonly<{ type: 'full-build-failed' }>
    | Readonly<{ type: 'full-materialization-failed'; buildId: string }>
    | Readonly<{ type: 'patch-produced'; buildId: string; patch: WxSafePatch }>
    | Readonly<{ type: 'patches-write-failed'; buildId: string }>
    | Readonly<{ type: 'runtime-failed'; buildId: string; reason: string }>
    | Readonly<{ type: 'runtime-requested'; buildId: string; version: number }>

/** Effects are explicit topology outputs; filesystem, DevEngine, and HTTP work live only in their edges. */
export type WxHostCommand =
    | Readonly<{ kind: 'run-full-build'; reason: WxFullBuildReason }>
    | Readonly<{ buildId: string; kind: 'materialize-full' }>
    | Readonly<{
          buildId: string
          fromVersion: number
          kind: 'write-patches'
          patches: readonly WxRetainedPatch[]
          targetVersion: number
      }>

export type WxHostTransition = Readonly<{
    commands: readonly WxHostCommand[]
    state: WxHostState
}>

/** Creates the state before the first full build has supplied a physical baseline. */
export function createWxHostState(): WxHostState {
    return { kind: 'empty' }
}

/**
 * Reduces one host fact without retaining data about a runtime.
 *
 * The runtime version is intentionally consumed only by `runtime-requested`: a later request independently projects
 * the then-current patch history. This makes DevTools page restarts and App restarts naturally idempotent.
 */
export function transitionWxHost(state: WxHostState, fact: WxHostFact): WxHostTransition {
    switch (fact.type) {
        case 'full-build-required':
            return requireFullBuild(state, fact.reason)
        case 'full-build-ready':
            return fullBuildReady(state, fact.buildId)
        case 'full-build-failed':
            return transition({ kind: 'empty' }, [])
        case 'full-materialization-failed':
            return currentBuildFailed(state, fact.buildId, 'full-materialization-failed')
        case 'patch-produced':
            return appendPatch(state, fact)
        case 'patches-write-failed':
            return currentBuildFailed(state, fact.buildId, 'patch-write-failed')
        case 'runtime-failed':
            // The reason is intentionally edge-visible diagnostics. The topology only needs the terminal category.
            return currentBuildFailed(state, fact.buildId, 'runtime-failed')
        case 'runtime-requested':
            return projectRuntimeRequest(state, fact)
    }
}

/** Requests one complete physical baseline and discards the superseded patch history immediately. */
function requireFullBuild(state: WxHostState, reason: WxFullBuildReason): WxHostTransition {
    if (state.kind === 'building') {
        return transition(state, [])
    }
    return transition({ kind: 'building' }, [{ kind: 'run-full-build', reason }])
}

/** A successful full build starts a new build identity at patch version zero. */
function fullBuildReady(state: WxHostState, buildId: string): WxHostTransition {
    if (state.kind !== 'building') {
        return transition(state, [])
    }
    const build: WxCurrentBuild = { buildId, patches: [] }
    return transition({ build, kind: 'ready' }, [{ buildId, kind: 'materialize-full' }])
}

/** Appends only patches emitted for the current physical build. */
function appendPatch(state: WxHostState, fact: Extract<WxHostFact, { type: 'patch-produced' }>): WxHostTransition {
    if (state.kind !== 'ready' || state.build.buildId !== fact.buildId) {
        return transition(state, [])
    }
    const patch: WxRetainedPatch = { patch: fact.patch, version: state.build.patches.length + 1 }
    return transition({ build: { ...state.build, patches: [...state.build.patches, patch] }, kind: 'ready' }, [])
}

/**
 * Projects the complete missing suffix for this one runtime request.
 *
 * No runtime version is written into state. A valid request can be repeated safely: it selects the same immutable
 * suffix until the runtime reports a newer version after successful reconciliation.
 */
function projectRuntimeRequest(
    state: WxHostState,
    request: Extract<WxHostFact, { type: 'runtime-requested' }>
): WxHostTransition {
    if (state.kind !== 'ready') {
        return transition(state, [])
    }
    if (request.buildId !== state.build.buildId) {
        // An App heap from an earlier full build cannot apply current patches; rewrite the current baseline instead.
        return transition(state, [{ buildId: state.build.buildId, kind: 'materialize-full' }])
    }
    if (!Number.isSafeInteger(request.version) || request.version < 0 || request.version > state.build.patches.length) {
        return requireFullBuild(state, 'runtime-ahead-of-history')
    }

    const patches = state.build.patches.slice(request.version)
    if (patches.length === 0) {
        return transition(state, [])
    }
    return transition(state, [
        {
            buildId: state.build.buildId,
            fromVersion: request.version,
            kind: 'write-patches',
            patches,
            targetVersion: patches.at(-1)?.version ?? request.version
        }
    ])
}

/** Turns a failure tied to the current physical build into one full-build command. */
function currentBuildFailed(state: WxHostState, buildId: string, reason: WxFullBuildReason): WxHostTransition {
    if (state.kind !== 'ready' || state.build.buildId !== buildId) {
        return transition(state, [])
    }
    return requireFullBuild(state, reason)
}

function transition(state: WxHostState, commands: readonly WxHostCommand[]): WxHostTransition {
    return { commands, state }
}
