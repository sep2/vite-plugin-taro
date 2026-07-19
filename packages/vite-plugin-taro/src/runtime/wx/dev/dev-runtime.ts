import type { Messenger, DevRuntime as RolldownDevRuntime } from 'rolldown/experimental/runtime-types'

type DevRuntimeConstructor = new (messenger: Messenger, clientId: string) => RolldownDevRuntime

type HmrInfo = Readonly<{
    buildId: string
    endpoint: string
}>

type DevRuntimeGlobal = {
    __rolldown_runtime__?: RolldownDevRuntime
}

declare const global: DevRuntimeGlobal
declare const DevRuntime: DevRuntimeConstructor

class WxHotContext {
    readonly moduleId: string
    readonly data: Record<string, unknown> = {}
    // Rolldown's Vite-compatible context expects these CSS hooks. WX CSS HMR is intentionally not implemented yet.
    readonly _internal = {
        /** Accepts a stylesheet update only to satisfy Vite's context shape; it deliberately changes no WXSS. */
        updateStyle(): void {},
        /** Removes a stylesheet only to satisfy Vite's context shape; it deliberately changes no WXSS. */
        removeStyle(): void {}
    }

    /** Creates the one hot-context object associated with an instrumented module ID. */
    constructor(moduleId: string) {
        this.moduleId = moduleId
    }

    /** Placeholder for Vite self/dependency acceptance; future patch application will retain accepted callbacks here. */
    accept(): void {}

    /** Placeholder for Vite export acceptance; future patch application will retain accepted export callbacks here. */
    acceptExports(): void {}

    /** Placeholder for Vite disposal; future replacement will run callbacks with persistent hot data. */
    dispose(): void {}

    /** Placeholder for Vite pruning; future recovery will run callbacks before discarding modules. */
    prune(): void {}

    /** Placeholder for an explicit HMR recovery request from application code. */
    invalidate(): void {}

    /** Placeholder for registering a Vite custom-event listener. */
    on(): void {}

    /** Placeholder for removing a Vite custom-event listener. */
    off(): void {}

    /** Placeholder for sending a Vite custom event through the future DevHost protocol. */
    send(): void {}
}

class WxDevRuntime extends DevRuntime {
    private hmrInfo: HmrInfo | undefined

    /** Installs Rolldown's base runtime and forwards its already-batched executed-module reports to DevHost. */
    constructor(clientId: string) {
        // Rolldown's constructor stores this messenger without invoking it, so the deferred arrow can safely bind this
        // runtime after super() returns.
        super({ send: ({ modules }) => this.registerModules(modules) }, clientId)
    }

    /** Receives App-loaded metadata and registers this heap before its first module report, like Vite's client hello. */
    setHmrInfo(hmrInfo: HmrInfo): void {
        this.hmrInfo = hmrInfo
        this.registerModules([])
    }

    /** Posts one Rolldown-batched execution report; Rolldown reuses its array, so copy it before native request handling. */
    private registerModules(modules: string[]): void {
        const hmrInfo = this.hmrInfo
        if (!hmrInfo) {
            return
        }

        wx.request({
            url: hmrInfo.endpoint,
            method: 'POST',
            data: { buildId: hmrInfo.buildId, clientId: this.clientId, modules: modules.slice() },
            header: { 'content-type': 'application/json' },
            success(): void {},
            complete(): void {}
        })
    }

    /** Creates the context that each Rolldown-instrumented module receives before its original module body runs. */
    override createModuleHotContext(moduleId: string): WxHotContext {
        return new WxHotContext(moduleId)
    }

    /** Placeholder for Rolldown's accepted-boundary callbacks; real patch execution is added with the DevHost protocol. */
    override applyUpdates(_boundaries: [string, string][]): void {}
}

global.__rolldown_runtime__ = new WxDevRuntime(createClientId())

/** Generates a fresh identity for this JavaScript heap, distinct from the shared physical-build ID in hmr/info.js. */
function createClientId(): string {
    return `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`
}
