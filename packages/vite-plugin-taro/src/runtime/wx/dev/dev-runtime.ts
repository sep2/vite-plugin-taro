// WX AppService dev runtime — injected verbatim at the end of the shared Rolldown runtime chunk
// (`assets/rolldown-runtime.js`, required first by every chunk). Defines the App-global
// `__rolldown_runtime__` that generated modules call.
//
// The `DevRuntime` base class is injected into the chunk by Rolldown's dev-mode transform
// (verified: `typeof DevRuntime` is `function`), so the WX host only extends it — the minimum
// skeleton, no reimplementation.

import type { Messenger, DevRuntime as RolldownDevRuntime } from 'rolldown/experimental/runtime-types'

/** Lexical base class injected into the runtime chunk by Rolldown; typed via the contract. */
declare const DevRuntime: new (messenger: Messenger, clientId: string) => RolldownDevRuntime

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
}

const runtime = new WxDevRuntime()
;(globalThis as { __rolldown_runtime__?: WxDevRuntime }).__rolldown_runtime__ = runtime
