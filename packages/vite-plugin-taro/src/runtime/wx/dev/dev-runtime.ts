// WX AppService dev runtime — bundled and injected verbatim at the end of the shared Rolldown
// runtime chunk (`assets/rolldown-runtime.js`, required first by every chunk). Defines the
// App-global `__rolldown_runtime__` that generated modules call.
//
// The `DevRuntime` base class is injected into the chunk by Rolldown's dev-mode transform
// (verified: `typeof DevRuntime` is `function`), so the WX host only extends it.
//
// This step only stores patches: every valid hmr/patches.js payload is merged into a
// version-keyed map for a later step to apply. Storing the same version twice (a second Page
// requiring the same patches.js) is idempotent.

import type { Messenger, DevRuntime as RolldownDevRuntime } from 'rolldown/experimental/runtime-types'

/** Lexical base class injected into the runtime chunk by Rolldown; typed via the contract. */
declare const DevRuntime: new (messenger: Messenger, clientId: string) => RolldownDevRuntime

/** Identity and report endpoint, materialized by the host into hmr/info.js for every full build. */
type HmrInfo = Readonly<{
    buildId: string
    endpoint: string
}>

/** One physical hmr/patches.js payload: the build identity plus one factory per HostPatch. */
type PatchPayload = Readonly<{
    buildId: string
    patches: readonly PatchProgram[]
}>

/** One HostPatch: its absolute version and the Rolldown factory to run. */
type PatchProgram = Readonly<{
    version: number
    factory: () => void
}>

/** Per-module hot state */
class WxHotContext {
    readonly _internal = {
        updateStyle(): void {},
        removeStyle(): void {}
    }
    accept() {}
    acceptExports() {}
    dispose() {}
    prune() {}
    invalidate() {}
    on() {}
    off() {}
    send() {}
}

/** The WX host: extends the Rolldown contract instead of reimplementing it. */
class WxDevRuntime extends DevRuntime {
    private hmrInfo: HmrInfo | undefined

    /** Module ids executed since the last report; flushed with every report request. */
    private readonly pendingModules = new Set<string>()

    /** Stored HostPatch factories keyed by absolute version; the apply step walks versions upward. */
    private readonly patches = new Map<number, () => void>()

    constructor() {
        super({ send(): void {} }, '')
    }

    /**
     * Generated code always calls this before registerModule and reads `_internal` from the return
     * value. Dummy context for now: no per-module state is tracked yet.
     */
    override createModuleHotContext(_moduleId: string): WxHotContext {
        return new WxHotContext()
    }

    /** The base registerModule funnels every executed module here; the next report carries them. */
    override sendModuleRegisteredMessage = (module: string): void => {
        this.pendingModules.add(module)
    }

    /** Consumed once per App heap from hmr/info.js; the host buildId is the Rolldown client ID. */
    initialize(info: HmrInfo): void {
        if (this.hmrInfo) {
            return
        }
        this.hmrInfo = info
        this.clientId = info.buildId
        this.report(0)
    }

    /** The only direct effect of hmr/patches.js: validate and store for a later apply step. */
    storePatches(payload: PatchPayload): void {
        const info = this.hmrInfo
        if (!info || payload.buildId !== info.buildId) {
            console.warn('[vite-plugin-taro] patches for a stale build')
            return
        }

        for (const patch of payload.patches) {
            this.patches.set(patch.version, patch.factory)
        }
    }

    private report(version: number): void {
        const info = this.hmrInfo
        if (!info) {
            return
        }
        const modules = [...this.pendingModules]
        this.pendingModules.clear()
        wx.request({
            url: info.endpoint,
            method: 'POST',
            data: {
                buildId: info.buildId,
                version,
                modules
            },
            header: { 'content-type': 'application/json' },
            success(): void {},
            fail(): void {},
            complete(): void {}
        })
    }
}

const runtime = new WxDevRuntime()
;(globalThis as { __rolldown_runtime__?: WxDevRuntime }).__rolldown_runtime__ = runtime
