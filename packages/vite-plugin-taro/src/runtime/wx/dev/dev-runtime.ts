// WX dev runtime — bundled and injected verbatim at the end of the shared Rolldown
// runtime chunk (`assets/rolldown-runtime.js`, required first by every chunk). Defines the
// App-global `__rolldown_runtime__` that generated modules call.
//
// The `DevRuntime` base class is injected into the chunk by Rolldown's dev-mode
// transform, so the WX host only extends it.
//
// Delivery is passive: every valid hmr/patches.js suffix is applied synchronously before the Page continues evaluating, then
// its successful application frontier is reported to the host. Already-applied sequences are ignored when another Page
// requires the same cumulative physical file.

import type { DevRuntime as RolldownDevRuntime } from 'rolldown/experimental/runtime-types'

/** Lexical base class injected into the runtime chunk by Rolldown; typed via the contract. */
declare const DevRuntime: new (clientId: string) => RolldownDevRuntime

/** Identity and report endpoint, materialized by the host into hmr/info.js for every full build. */
type HmrInfo = Readonly<{
    buildId: string
    endpoint: string
}>

/** One physical hmr/patches.js payload: the build identity plus one patch program per update. */
type PatchPayload = Readonly<{
    buildId: string
    patches: readonly PatchProgram[]
}>

/** One patch: its Rolldown sequence, changed module ids, and factory program. */
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

/**
 * Per-module hot state, mirroring Rolldown's web runtime: accept is a passive registration;
 * the propagation invokes the previous execution's callbacks with the fresh exports.
 */
class WxHotContext {
    readonly _internal = {
        updateStyle(): void {},
        removeStyle(): void {}
    }

    /** Registered self-accept callbacks; a bare accept is represented by a no-op callback. */
    private readonly acceptCallbacks: AcceptCallback[] = []

    /** Set when a callback rejects a Refresh boundary; the current update then rebuilds. */
    private invalidationReason: string | undefined

    accept(callback?: AcceptCallback): void {
        this.acceptCallbacks.push(callback ?? (() => {}))
    }

    hasAccepts(): boolean {
        return this.acceptCallbacks.length > 0
    }

    /** Invokes this old context's callbacks and returns any requested invalidation. */
    runAccept(moduleExports: unknown): string | undefined {
        for (const callback of this.acceptCallbacks) {
            callback(moduleExports)
        }
        return this.invalidationReason
    }

    invalidate(reason?: string): void {
        this.invalidationReason = reason ?? 'the accepting module invalidated the update'
    }

    // Vite's generated CSS module calls hot.prune with its style teardown; the physical
    // rebuild replaces styles wholesale, so it is a no-op.
    prune(_callback?: () => void): void {}
}

/** The WX host: extends the Rolldown contract instead of reimplementing it. */
class WxDevRuntime extends DevRuntime {
    private hmrInfo: HmrInfo | undefined

    /** Highest Rolldown sequence successfully applied. */
    private appliedSeq = 0

    /** Active hot contexts per module id; the propagation invokes their callbacks. */
    private readonly moduleHotContexts = new Map<string, WxHotContext>()

    constructor() {
        // The base has no messenger: the engine tracks per-client shipped payloads instead
        // of executed module ids, so the wx host registers the client session itself.
        super('')
    }

    /**
     * Generated code always calls this before registerModule and reads `_internal` from the
     * return value. Mirrors Rolldown's web runtime: each execution immediately replaces the
     * module's hot context; the apply plan has already captured the previous callbacks.
     */
    override createModuleHotContext(moduleId: string): WxHotContext {
        const hotContext = new WxHotContext()
        this.moduleHotContexts.set(moduleId, hotContext)
        return hotContext
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

        if (this.moduleHotContexts.get(moduleId)?.hasAccepts()) {
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
            const invalidationReason = hotContext?.runAccept(this.initModule(moduleId))
            if (invalidationReason) {
                throw new Error(`${moduleId}: ${invalidationReason}`)
            }
        }
    }

    /** Consumed once per App heap from hmr/info.js; the host buildId identifies its cumulative patch history. */
    initialize(info: HmrInfo): void {
        if (this.hmrInfo) {
            return
        }
        this.hmrInfo = info
    }

    /** True between a patch delivery and the next page show: a hot reload is in progress. */
    private hotReloading = false

    /** The capsule wrapper asks this during the synthetic lifecycle of a hot reload. */
    isHotReloading(): boolean {
        return this.hotReloading
    }

    /** The wrapped onShow ends the hot reload after the replacement cycle. */
    clearHotReloading(): void {
        this.hotReloading = false
    }

    /** The only direct effect of hmr/patches.js: apply its cumulative suffix and report the resulting frontier. */
    storePatches(payload: PatchPayload): void {
        const info = this.hmrInfo
        if (!info || payload.buildId !== info.buildId) {
            console.warn('[vpt] patches for a stale build')
            return
        }

        // A delivered patch means DevTools is about to replay the page lifecycle on the
        // re-executing Pages; the capsule wrapper suppresses the synthetic unmount/mount so
        // the React tree survives and Refresh swaps the code in place.
        this.hotReloading = true

        // Apply synchronously: the page's imports below the require resolve against the
        // freshly registered modules, so the re-executed Page evaluates with the new code.
        if (this.applyPatches(payload.patches)) {
            // The host may publish later generations while this synchronous apply runs. Reporting only afterward makes this
            // the application frontier: publisher history is never pruned merely because its JavaScript file was observed.
            void this.sendReport({ kind: 'applied', seq: this.appliedSeq })
        }
    }

    /**
     * Folds one cumulative physical patch file into a single logical HMR update.
     *
     * `hmr/patches.js` can contain several unacknowledged Rolldown patches and can be required by several Page shells. The
     * runtime must therefore ignore replayed sequences, reject a missing sequence, and move directly from the currently live
     * module generation to the latest published generation without rendering intermediate generations.
     */
    private applyPatches(patches: readonly PatchProgram[]): boolean {
        // Keep the initial watermark immutable throughout the fold. Comparing replays against a moving watermark would allow
        // a duplicate new sequence in the same payload to masquerade as an already-applied patch.
        const previousSeq = this.appliedSeq

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
            this.appliedSeq = nextSeq - 1
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
        const info = this.hmrInfo
        if (!info) {
            // A report without initialize is a programming error; fail loudly instead of
            // silently dropping the sync traffic.
            throw new Error('WX dev runtime is not initialized')
        }
        return new Promise((resolve, reject) => {
            wx.request({
                url: info.endpoint,
                method: 'POST',
                data: { buildId: info.buildId, ...data },
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

// Install the React DevTools hook before the Taro renderer injects itself: the runtime chunk
// is the first module of the App heap, and the renderer checks the hook when it evaluates at
// App mount. The refresh runtime's own injection (see react-refresh.ts) replays this hook's
// renderers, so the hook must store what inject receives — a real DevTools hook keeps the
// renderer in the renderers Map; without the stored renderer the replay captures nothing and
// Refresh has no renderer helpers to schedule re-renders on.
//
// The hook lives on `global`, and every free `__REACT_DEVTOOLS_GLOBAL_HOOK__` reference in
// react-family modules is rewritten to `global.__REACT_DEVTOOLS_GLOBAL_HOOK__`: the
// The WeChat runtime scope does not resolve free variables against `global` (verified: the free
// lookup is undefined while the member access exists), so the renderer would never inject
// otherwise. `??=` keeps a pre-installed hook (e.g. a real DevTools integration) intact; the
// runtime chunk's own lowering keeps the operator es2018-compatible.
const reactDevtoolsHook = {
    renderers: new Map<number, unknown>(),
    supportsFiber: true,
    inject: (injected: unknown) => {
        const id = reactDevtoolsHook.renderers.size
        reactDevtoolsHook.renderers.set(id, injected)
        return id
    },
    onScheduleFiberRoot: () => {},
    onCommitFiberRoot: () => {},
    onCommitFiberUnmount: () => {}
}
// node types declare `global` as typeof globalThis, so the WeChat global needs a cast.
;(global as WeChatGlobal).__REACT_DEVTOOLS_GLOBAL_HOOK__ ??= reactDevtoolsHook
