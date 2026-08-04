// WX AppService dev runtime — injected verbatim at the end of the shared Rolldown runtime chunk
// (`assets/rolldown-runtime.js`, required first by every chunk). Defines the App-global
// `__rolldown_runtime__` that generated modules call.
//
// The `DevRuntime` base class is injected into the chunk by Rolldown's dev-mode transform
// (verified: `typeof DevRuntime` is `function`), so the WX host only extends it.
//
// This step: consume hmr/info.js and send the one startup report `{ buildId, version: 0 }`.

import type { Messenger, DevRuntime as RolldownDevRuntime } from 'rolldown/experimental/runtime-types'

/** Lexical base class injected into the runtime chunk by Rolldown; typed via the contract. */
declare const DevRuntime: new (messenger: Messenger, clientId: string) => RolldownDevRuntime

/** Identity and report endpoint, materialized by the host into hmr/info.js for every full build. */
type HmrInfo = Readonly<{
    buildId: string
    endpoint: string
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

    /** Consumed once per App heap from hmr/info.js; the host buildId is the Rolldown client ID. */
    initialize(info: HmrInfo): void {
        this.hmrInfo = info
        this.clientId = info.buildId
        this.report()
    }

    private report(): void {
        const info = this.hmrInfo
        if (!info) {
            return
        }
        wx.request({
            url: info.endpoint,
            method: 'POST',
            data: {
                buildId: info.buildId,
                version: 0
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
