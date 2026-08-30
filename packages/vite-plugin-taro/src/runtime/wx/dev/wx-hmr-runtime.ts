/*
 * Shared WX HMR runtime, bundled into the mode-selected entry and injected into Rolldown's generated runtime chunk.
 * Rolldown provides the lexical `DevRuntime` base class; this file extends that registry instead of duplicating module loading.
 *
 * Concrete modes decide how executable registrations arrive—native project JavaScript or interpreted source—and provide only a
 * synchronous installer. This class owns the invariant that installation, graph propagation, cache eviction, boundary execution,
 * and ACK form one application transaction; it has no file-delivery or interpreter policy of its own.
 */

import type { DevRuntime as RolldownDevRuntime } from 'rolldown/experimental/runtime-types'
import {
    type HmrInfo,
    type RuntimeControlMessage,
    type RuntimeReport,
    runtimeControlEvent,
    runtimeReportEvent
} from './wx-hmr-protocol.ts'

/** Lexical base class injected into the runtime chunk by Rolldown; typed via the contract. */
declare const DevRuntime: new (clientId: string) => RolldownDevRuntime

/** App-heap HMR identity; only the committed application frontier mutates. */
type HmrSession = {
    /** Rejects delayed patch delivery and identifies reports after a newer full build exists. */
    readonly buildId: string
    /**
     * Highest contiguous application sequence whose installation, graph propagation, and accept callbacks all succeeded.
     * Host-filtered native asset updates consume no sequence. Replayed mode deliveries read this watermark; it advances only
     * after an atomic batch succeeds and resets only with a new App heap.
     */
    appliedSeq: number
}

/** Mode-independent patch metadata consumed by the shared sequence and graph reducer. */
export type RuntimePatch = Readonly<{
    seq: number
    /** Stable ids of the changed modules; synchronous application walks the graph from these roots. */
    changedIds: readonly string[]
}>

type RuntimeReportData = Readonly<{ kind: 'applied'; seq: number }> | Readonly<{ kind: 'rebuild'; reason: string }>

type HmrUpdate = Readonly<{
    boundaries: readonly string[]
    updateSet: ReadonlySet<string>
}>

type AcceptCallback = (moduleExports: unknown) => void

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

/** Shared WX host mechanics extending the Rolldown contract instead of reimplementing it. */
export class WxHmrRuntime extends DevRuntime {
    /**
     * One session for this App heap. Undefined only before the mode-selected entry initializes the runtime; its identity then
     * stays fixed while appliedSeq records the committed frontier.
     */
    private session: HmrSession | undefined

    /** The App heap's sole SocketTask, assigned once by initialize and retained for its lifetime. */
    private socket: WeChatSocketTask | undefined

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

    /**
     * Initializes exactly once per App heap. Repeated entry evaluation must not replace the identity or reset `appliedSeq`, because
     * either change could acknowledge factories against another host client or replay already committed application generations.
     */
    initialize(info: HmrInfo): void {
        if (this.session) return
        this.session = { buildId: info.buildId, appliedSeq: 0 }

        const socket = wx.connectSocket({ url: info.endpoint, protocols: ['vite-hmr'] })
        this.socket = socket

        socket.onMessage(({ data }) => {
            if (typeof data !== 'string') return
            const message = JSON.parse(data) as Readonly<{
                type: string
                event?: string
                data?: unknown
            }>
            if (message.type !== 'custom' || !message.event) return
            if (message.event === runtimeControlEvent) {
                const control = message.data as RuntimeControlMessage
                this.stopSocket(control.reason)
                return
            }
            this.onSocketEvent(info, message.event, message.data)
        })
    }

    /** Receives mode-specific Vite custom events after shared control messages have been handled. */
    protected onSocketEvent(_info: HmrInfo, _event: string, _data: unknown): void {}

    /** Sends one typed Vite custom event through the current App-level socket. */
    protected sendSocketEvent(event: string, data: unknown): void {
        const socket = this.socket
        if (!socket) {
            throw new Error('WX HMR socket is not initialized')
        }
        socket.send({ data: JSON.stringify({ type: 'custom', event: event, data: data }) })
    }

    /** Closes the sole socket after terminal host control or interpreter failure. */
    protected stopSocket(reason: string): void {
        const socket = this.socket
        if (!socket) {
            throw new Error('WX HMR socket is not initialized')
        }

        socket.close({ code: 1000, reason: reason })
    }

    /**
     * Applies one mode-delivered cumulative payload through its mode-specific patch installer.
     *
     * Application is deliberately synchronous so every later message observes the committed module generation. The installer is
     * the only mode seam; sequence validation and ACK reporting stay here so no mode can mistake delivery for application.
     */
    protected applyPatchPayload<Patch extends RuntimePatch>(
        payload: Readonly<{ buildId: string; patches: readonly Patch[] }>,
        installPatch: (patch: Patch) => void
    ): boolean {
        const session = this.session
        if (!session || payload.buildId !== session.buildId) {
            console.warn('[vpt] patches for a stale build')
            return false
        }

        const applied = this.applyPatchBatch(session, payload.patches, installPatch)
        if (applied) {
            // The host may publish later generations while synchronous application runs. Reporting only afterward makes this the
            // application frontier: journal history is never pruned merely because a delivery became observable.
            void this.sendReport({ kind: 'applied', seq: session.appliedSeq })
        }
        return applied
    }

    /**
     * Folds one cumulative mode delivery into a single logical HMR update.
     *
     * A delivery may contain several unacknowledged application patches and may be replayed by its mode—for DevTools, every
     * affected live Page evaluates the same physical file. The runtime therefore ignores old sequences, rejects a missing one,
     * and moves directly from the live module generation to the latest published one without intermediate renders.
     *
     * For an appliedSeq of 4:
     *
     * - [5, 6, 7] installs every patch, applies their unioned changedIds, commits appliedSeq 7, and reports 7;
     * - a replay of [5, 6, 7] leaves the latest factories untouched;
     * - [5, 7] fails at expected sequence 6, keeps appliedSeq 4, and requests a complete rebuild.
     */
    private applyPatchBatch<Patch extends RuntimePatch>(
        session: HmrSession,
        patches: readonly Patch[],
        installPatch: (patch: Patch) => void
    ): boolean {
        // Keep the initial watermark immutable throughout the fold. Comparing replays against a moving watermark would allow
        // a duplicate new sequence in the same payload to masquerade as an already-applied patch.
        const previousSeq = session.appliedSeq

        // Mutable only during this synchronous pass. `nextSeq` validates continuity while `changedIds` unions every incremental
        // patch's roots for the one final graph traversal; neither value escapes into persistent runtime state.
        let nextSeq = previousSeq + 1
        const changedIds = new Set<string>()

        try {
            for (const patch of patches) {
                // Replayed delivery prefixes must not let an old installation overwrite newer factories already stored in the
                // Rolldown runtime.
                if (patch.seq <= previousSeq) {
                    continue
                }

                // Every patch is incremental: if one delivery was missed, later patches cannot reconstruct modules changed only
                // by that missing sequence. Rebuilding is safer than silently running a mixed module generation.
                if (patch.seq !== nextSeq) {
                    throw new Error(`missing patch sequence ${nextSeq}`)
                }

                // Mode installation registers module graphs and factories without executing application modules. Running every
                // installer first leaves the registry at the latest generation while avoiding intermediate renders.
                installPatch(patch)

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
            // incorrectly bubble through the accepting capsule as though no HMR boundary existed.
            this.applyHmrUpdate(changedIds)

            // Commit application only after graph propagation and boundary callbacks succeed. A failure leaves the old watermark
            // intact and requests a full rebuild below, so a partially applied batch is never acknowledged as healthy.
            session.appliedSeq = nextSeq - 1
            return true
        } catch (error) {
            // An installer may already have replaced some factories and the module registry has no inverse operation. Keep the
            // old application watermark unacknowledged and request a complete build, the only coherent rollback boundary.
            console.warn('[vpt] patch batch failed; apply stopped', error)
            void this.sendReport({
                kind: 'rebuild',
                reason: Error.isError(error) ? error.message : String(error)
            })
            return false
        }
    }

    /** Sends one application-frontier or rebuild report through the shared Vite WebSocket. */
    private sendReport(data: RuntimeReportData): void {
        const session = this.session
        if (!session) {
            // A report without initialize is a programming error; fail loudly instead of
            // silently dropping the sync traffic.
            throw new Error('WX dev runtime is not initialized')
        }
        const report: RuntimeReport = { buildId: session.buildId, ...data }
        this.sendSocketEvent(runtimeReportEvent, report)
    }
}
