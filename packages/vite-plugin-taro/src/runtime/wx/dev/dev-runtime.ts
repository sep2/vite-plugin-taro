// WX AppService dev runtime — injected verbatim at the end of the shared Rolldown runtime chunk
// (`assets/rolldown-runtime.js`, required first by every chunk). Must stay a self-contained plain
// script: no imports, no exports, no module syntax. Defines the App-global `__rolldown_runtime__`
// that generated modules call; nothing else (no HMR protocol yet).

class WxHotContext {
    readonly data: Record<string, unknown> = {}
    readonly _internal = {
        updateStyle(): void {},
        removeStyle(): void {}
    }

    accept(..._args: unknown[]): void {}
    acceptExports(..._args: unknown[]): void {}
    dispose(..._args: unknown[]): void {}
    prune(..._args: unknown[]): void {}
    invalidate(): void {}
    on(): void {}
    off(): void {}
    send(): void {}
}

class WxDevRuntime {
    /** Rolldown module table: module id to its live exports holder. */
    readonly modules: Record<string, { exportsHolder: { exports: unknown } }> = {}

    /** Rolldown client ID; will become the host buildId once the HMR protocol lands. */
    clientId = ''

    createModuleHotContext(moduleId: string): WxHotContext {
        let context = this.hotContexts.get(moduleId)
        if (!context) {
            context = new WxHotContext()
            this.hotContexts.set(moduleId, context)
        }
        return context
    }

    registerModule(id: string, exportsHolder: { exports: unknown }): void {
        this.modules[id] = { exportsHolder }
    }

    loadExports(id: string): unknown {
        return this.modules[id]?.exportsHolder.exports ?? {}
    }

    applyUpdates(): void {}

    createEsmInitializer<T>(_id: string, fn: (() => T) | undefined, _dedup: unknown, res: T): () => T {
        return () => (fn ? (res = fn()) : res)
    }

    createCjsInitializer<T extends { exports: unknown }>(
        _id: string,
        cb: (exports: unknown, mod: { exports: unknown }) => void,
        _dedup: unknown,
        mod: { exports: unknown } | undefined
    ): () => T {
        return () => (
            mod || cb((mod = { exports: {} }).exports, mod),
            (mod as { exports: T }).exports
        )
    }

    private readonly hotContexts = new Map<string, WxHotContext>()
}

const runtime = new WxDevRuntime()
;(globalThis as { __rolldown_runtime__?: WxDevRuntime }).__rolldown_runtime__ = runtime
