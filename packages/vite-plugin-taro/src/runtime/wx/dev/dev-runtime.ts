// WX dev runtime — bundled and injected verbatim at the end of the shared Rolldown
// runtime chunk (`assets/rolldown-runtime.js`, required first by every chunk). Defines the
// App-global `__rolldown_runtime__` that generated modules call.
//
// The `DevRuntime` base class is injected into the chunk by Rolldown's dev-mode
// transform, so the WX host only extends it.
//
// Every Page explicitly passes the inert hmr/patches.js export here before native Page registration. The runtime applies that
// cumulative suffix synchronously, reports its successful application frontier, and ignores sequences replayed by other Pages.

import type { DevRuntime as RolldownDevRuntime } from 'rolldown/experimental/runtime-types'

/** Lexical base class injected into the runtime chunk by Rolldown; typed via the contract. */
declare const DevRuntime: new (clientId: string) => RolldownDevRuntime

/** Identity and report endpoint, materialized by the host into hmr/info.js for every full build. */
type HmrInfo = Readonly<{
    buildId: string
    endpoint: string
}>

/** App-heap HMR identity; only the committed application frontier mutates. */
type HmrSession = {
    /** Rejects delayed patch files and identifies reports after a newer full build exists. */
    readonly buildId: string
    /** Fixed control URL discovered from the Vite server that produced this full build. */
    readonly endpoint: string
    /**
     * Highest contiguous application sequence whose factories, graph propagation, and accept callbacks all succeeded.
     * Host-filtered native asset updates consume no sequence. Replayed Page shells read this watermark; it advances only
     * after an atomic batch succeeds and resets only with a new App heap.
     */
    appliedSeq: number
}

/** One physical hmr/patches.js payload: the build identity plus one patch program per update. */
type PatchPayload = Readonly<{
    buildId: string
    patches: readonly PatchProgram[]
}>

/** One patch: its physical application sequence, changed module ids, and Rolldown factory program. */
type PatchProgram = Readonly<{
    seq: number
    /** Stable ids of the changed modules; the sync apply walks the graph from these. */
    changedIds: string[]
    factory: () => void
}>

type HmrUpdate = Readonly<{
    boundaries: readonly string[]
    updateSet: ReadonlySet<string>
}>

type AcceptCallback = (moduleExports: unknown) => void

type NativePage = {
    data: Record<string, unknown>
}

const pageHmrStateKey: unique symbol = Symbol('vpt.pageHmrState')

type PageHmrState = {
    /** True only across the unload/load/show sequence triggered by one native re-registration. */
    isReregistering: boolean
    /** The Page bound to `this` by ordinary onLoad, retained until ordinary onUnload. */
    mountedPage: NativePage | undefined
}

type HmrPageConfig = {
    data: Record<string, unknown>
    onUnload?: unknown
    onLoad?: unknown
    onShow?: unknown
    [pageHmrStateKey]?: PageHmrState
}

/** Calls a native lifecycle with the same Page bound to `this` and the same arguments. */
function forward(handler: unknown, page: unknown, args: unknown[]): void {
    if (typeof handler === 'function') handler.apply(page, args)
}

/** Shared no-op CSS contract because physical rebuilds replace styles wholesale. */
const hotContextInternals = Object.freeze({
    updateStyle(): void {},
    removeStyle(): void {}
})

/**
 * Per-module hot state, mirroring Rolldown's web runtime: accept is a passive registration;
 * the propagation invokes the previous execution's callbacks with the fresh exports.
 */
class WxHotContext {
    readonly _internal = hotContextInternals

    /**
     * Callbacks registered by this module execution. The array is allocated on first accept,
     * remains attached to the old execution across cache eviction, and is invoked by the next
     * boundary execution. Undefined means this context stays passive.
     */
    private acceptCallbacks: Array<AcceptCallback | undefined> | undefined

    /** Stable module identity and shared sparse index used only when this context accepts. */
    private readonly moduleId: string
    private readonly acceptingContexts: Map<string, WxHotContext>

    constructor(moduleId: string, acceptingContexts: Map<string, WxHotContext>) {
        this.moduleId = moduleId
        this.acceptingContexts = acceptingContexts
    }

    accept(callback?: AcceptCallback): void {
        if (!this.acceptCallbacks) {
            this.acceptCallbacks = [callback]
            this.acceptingContexts.set(this.moduleId, this)
            return
        }
        this.acceptCallbacks.push(callback)
    }

    /** Invokes this old context's callbacks; invalidation aborts the update synchronously. */
    runAccept(moduleExports: unknown): void {
        const callbacks = this.acceptCallbacks
        if (!callbacks) {
            throw new Error(`passive hot context reached as boundary: ${this.moduleId}`)
        }

        for (const callback of callbacks) {
            callback?.(moduleExports)
        }
    }

    invalidate(reason?: string): never {
        throw new Error(reason ?? 'the accepting module invalidated the update')
    }

    // Vite's generated CSS module calls hot.prune with its style teardown; the physical
    // rebuild replaces styles wholesale, so it is a no-op.
    prune(_callback?: () => void): void {}
}

/** The WX host: extends the Rolldown contract instead of reimplementing it. */
class WxDevRuntime extends DevRuntime {
    /**
     * One session for this App heap. Undefined only before app.js consumes hmr/info.js; its
     * identity and endpoint then stay fixed while appliedSeq records the committed frontier.
     */
    private session: HmrSession | undefined

    /**
     * Sparse current-generation accepting boundaries keyed by module id. Entries alone must
     * outlive Rolldown module-cache eviction so old callbacks can receive fresh exports.
     * createModuleHotContext removes the prior generation immediately; first accept inserts
     * the new one. Passive contexts are never retained, so space is O(number of boundaries).
     */
    private readonly moduleHotContexts = new Map<string, WxHotContext>()

    constructor() {
        // The base has no messenger: the engine tracks per-client shipped payloads instead
        // of executed module ids, so the wx host registers the client session itself.
        super('')
    }

    /**
     * Generated code always calls this before registerModule and reads `_internal` from the
     * return value. Each execution immediately retires its previous accepting boundary;
     * calling accept registers the new context after the apply plan captured old callbacks.
     */
    override createModuleHotContext(moduleId: string): WxHotContext {
        // A new execution supersedes the old boundary before it decides whether to accept.
        this.moduleHotContexts.delete(moduleId)
        return new WxHotContext(moduleId, this.moduleHotContexts)
    }

    /** Computes accepting boundaries and every executed module that must be re-armed. */
    private computeHmrUpdate(changedIds: Iterable<string>): HmrUpdate | undefined {
        // Mutable traversal accumulators are confined to one synchronous update plan.
        const boundaries: string[] = []
        const updateSet = new Set<string>()

        for (const changedId of changedIds) {
            if (!this.isExecuted(changedId)) continue

            // Mutable only for the current DFS path, providing O(1) cycle checks.
            const path = new Set([changedId])
            const fullReloadReason = this.bubble(changedId, path, updateSet, boundaries)
            if (fullReloadReason) {
                throw new Error(fullReloadReason)
            }
        }

        return boundaries.length > 0 ? { boundaries, updateSet } : undefined
    }

    /** Walks executed importers until an accepting boundary is found. */
    private bubble(
        moduleId: string,
        path: Set<string>,
        updateSet: Set<string>,
        boundaries: string[]
    ): string | undefined {
        if (updateSet.has(moduleId)) return undefined
        updateSet.add(moduleId)

        if (this.moduleHotContexts.has(moduleId)) {
            boundaries.push(moduleId)
            return undefined
        }

        const importers = this.getImporters(moduleId).filter((importer) => this.isExecuted(importer))
        if (importers.length === 0) {
            return `no HMR boundary found for module ${moduleId}`
        }

        for (const importer of importers) {
            if (path.has(importer)) {
                return `circular HMR propagation between ${moduleId} and ${importer}`
            }

            path.add(importer)
            const fullReloadReason = this.bubble(importer, path, updateSet, boundaries)
            path.delete(importer)
            if (fullReloadReason) return fullReloadReason
        }
        return undefined
    }

    /**
     * Applies one patch in three phases: capture old contexts, evict the whole update set,
     * then re-run accepting modules and pass their fresh exports to the old contexts.
     */
    private applyHmrUpdate(changedIds: Iterable<string>): void {
        const update = this.computeHmrUpdate(changedIds)
        if (!update) return

        for (const moduleId of update.updateSet) {
            if (!this.hasFactory(moduleId)) {
                throw new Error(`no HMR factory for module ${moduleId}`)
            }
        }

        const applies = update.boundaries.map((moduleId) => ({
            moduleId,
            hotContext: this.moduleHotContexts.get(moduleId)
        }))

        // This eviction must happen before initModule: otherwise its cache gate returns the
        // old exports and the freshly registered factory never executes.
        for (const moduleId of update.updateSet) {
            this.removeModuleCache(moduleId)
        }

        for (const { moduleId, hotContext } of applies) {
            hotContext?.runAccept(this.initModule(moduleId))
        }
    }

    /** Consumed once per App heap from hmr/info.js; the host buildId identifies its cumulative patch history. */
    initialize(info: HmrInfo): void {
        if (this.session) return
        this.session = { ...info, appliedSeq: 0 }
    }

    /** Tracks the mounted native Page and prepares its static config for HMR re-registration. */
    injectPageHmr(config: HmrPageConfig): HmrPageConfig {
        const existingState = config[pageHmrStateKey]

        if (existingState) {
            const mountedPage = existingState.mountedPage
            /*
             * The static config can outlive a native Page instance. Before its first ordinary onLoad, or after a real onUnload,
             * there is no mounted Page or current view-model to carry into another registration. Leave the lifecycle gate
             * unarmed and preserve the config's existing initial data so a future real onLoad still enters Taro normally.
             */
            if (!mountedPage) {
                return config
            }

            /*
             * Arm the lifecycle wrappers on this exact static config before it is passed back to `Page(config)`. DevTools then
             * triggers an unload/load/show sequence for that native re-registration: unload and load observe `true` and return
             * before entering Taro, preserving the mounted React tree and its original Page connection; show consumes the
             * one-shot gate by restoring `false`. Ordinary navigation never enters this branch, and every Page config owns an
             * independent state object, so no route map, global phase, or Page identity comparison participates in the decision.
             */
            existingState.isReregistering = true
            /*
             * `Page(config)` reads `config.data` as the initial native view-model for this registration. Supplying the mounted
             * Page's latest data before that call prevents the temporary Page used for re-registration callbacks from starting
             * empty. This is an O(1) reference assignment in vpt: it does not clone the recursive data tree, call `setData`, move
             * React state, or rebind Taro. The ordinary Taro lifecycle remains suppressed until re-registration onShow, so its
             * React tree and output connection stay attached to `mountedPage`; every later registration reads its latest data.
             */
            config.data = mountedPage.data

            return config
        }

        const originalOnUnload = config.onUnload
        const originalOnLoad = config.onLoad
        const originalOnShow = config.onShow

        const state: PageHmrState = {
            isReregistering: false,
            mountedPage: undefined
        }

        /*
         * Attach the one mutable HMR state object to this exact static config. The lifecycle wrappers below close over the same
         * object, while a later `injectPageHmr(config)` call finds it through the symbol and knows wrapping is already complete.
         * A symbol cannot collide with WeChat or Taro's string-named Page options, and config-local ownership avoids route maps,
         * a runtime-wide WeakMap, or state shared by two Page configs. The state becomes unreachable together with the config.
         */
        config[pageHmrStateKey] = state

        config.onUnload = function (this: NativePage, ...args: unknown[]) {
            if (state.isReregistering) {
                return
            }

            forward(originalOnUnload, this, args)
            state.mountedPage = undefined
        }

        config.onLoad = function (this: NativePage, ...args: unknown[]) {
            if (state.isReregistering) {
                return
            }

            forward(originalOnLoad, this, args)
            state.mountedPage = this
        }

        config.onShow = function (this: NativePage, ...args: unknown[]) {
            if (state.isReregistering) {
                state.isReregistering = false
                return
            }

            forward(originalOnShow, this, args)
        }

        return config
    }

    /** Applies one Page-delivered payload before its native shell registers the static route configuration. */
    applyPatches(payload: PatchPayload | undefined): void {
        // The initial physical dependency exports undefined until the host has a patch range.
        if (!payload) return

        const session = this.session
        if (!session || payload.buildId !== session.buildId) {
            console.warn('[vpt] patches for a stale build')
            return
        }

        // Apply synchronously: the page's imports below the require resolve against the
        // freshly registered modules, so the re-executed Page evaluates with the new code.
        if (this.applyPatchBatch(session, payload.patches)) {
            // The host may publish later generations while this synchronous apply runs. Reporting only afterward makes this
            // the application frontier: publisher history is never pruned merely because its JavaScript file was observed.
            void this.sendReport({ kind: 'applied', seq: session.appliedSeq })
        }
    }

    /**
     * Folds one cumulative physical patch file into a single logical HMR update.
     *
     * `hmr/patches.js` can contain several unacknowledged application patches and can be required by several Page shells. The
     * runtime must therefore ignore replayed sequences, reject a missing sequence, and move directly from the currently live
     * module generation to the latest published generation without rendering intermediate generations.
     *
     * For an appliedSeq of 4:
     *
     * - [5, 6, 7] registers every factory, performs one update using their unioned changedIds, commits appliedSeq 7, and reports 7;
     * - a second Page evaluating [5, 6, 7] skips the complete replay and leaves the latest factories untouched;
     * - [5, 7] fails at the expected sequence 6, keeps appliedSeq 4, and requests a full rebuild because factory 6 is unrecoverable.
     */
    private applyPatchBatch(session: HmrSession, patches: readonly PatchProgram[]): boolean {
        // Keep the initial watermark immutable throughout the fold. Comparing replays against a moving watermark would allow
        // a duplicate new sequence in the same payload to masquerade as an already-applied patch.
        const previousSeq = session.appliedSeq

        // Mutable only during this synchronous pass. `nextSeq` validates continuity while `changedIds` unions every incremental
        // patch's roots for the one final graph traversal; neither value escapes into persistent runtime state.
        let nextSeq = previousSeq + 1
        const changedIds = new Set<string>()

        try {
            for (const patch of patches) {
                // The same physical file is evaluated once per affected Page. Those later evaluations replay its prefix and
                // must not let an old factory overwrite the newer factory already stored in the Rolldown runtime.
                if (patch.seq <= previousSeq) {
                    continue
                }

                // Every patch is incremental: if one physical write was missed, later factories cannot reconstruct modules
                // changed only by that missing patch. Rebuilding is safer than silently running a mixed module generation.
                if (patch.seq !== nextSeq) {
                    throw new Error(`missing patch sequence ${nextSeq}`)
                }

                // A patch factory only registers module graphs and module factories; it does not execute application modules.
                // Running all of them first leaves the registry at the latest generation while avoiding intermediate renders.
                patch.factory()

                for (const changedId of patch.changedIds) {
                    changedIds.add(changedId)
                }

                nextSeq++
            }

            // A payload containing only replayed sequences requires no graph work and must not alter the application watermark.
            if (nextSeq === previousSeq + 1) {
                return true
            }

            // Apply once after every factory is registered. React Refresh arms a newly executed module's hot.accept callback
            // in a microtask; applying consecutive patches separately would inspect that intermediate context too early and
            // incorrectly bubble through the capsule to the native Page shell as though no HMR boundary existed.
            this.applyHmrUpdate(changedIds)

            // Commit application only after graph propagation and boundary callbacks succeed. A failure leaves the old watermark
            // intact and requests a full rebuild below, so a partially applied batch is never acknowledged as healthy.
            session.appliedSeq = nextSeq - 1
            return true
        } catch (error) {
            console.warn('[vpt] patch batch failed; apply stopped', error)
            void this.sendReport({
                kind: 'rebuild',
                reason: Error.isError(error) ? error.message : String(error)
            })
            return false
        }
    }

    /** Sends one metadata-only report to the host; executable code never travels over HTTP. */
    private sendReport(data: Record<string, unknown>): Promise<void> {
        const session = this.session
        if (!session) {
            // A report without initialize is a programming error; fail loudly instead of
            // silently dropping the sync traffic.
            throw new Error('WX dev runtime is not initialized')
        }
        return new Promise((resolve, reject) => {
            wx.request({
                url: session.endpoint,
                method: 'POST',
                data: { buildId: session.buildId, ...data },
                header: { 'content-type': 'application/json' },
                success(): void {
                    resolve()
                },
                fail(error: unknown): void {
                    reject(error)
                }
            })
        })
    }
}

const runtime = new WxDevRuntime()
;(globalThis as { __rolldown_runtime__?: WxDevRuntime }).__rolldown_runtime__ = runtime
