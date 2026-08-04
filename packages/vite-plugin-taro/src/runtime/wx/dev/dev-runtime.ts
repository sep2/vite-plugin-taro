// WX AppService dev runtime — bundled and injected verbatim at the end of the shared Rolldown
// runtime chunk (`assets/rolldown-runtime.js`, required first by every chunk). Defines the
// App-global `__rolldown_runtime__` that generated modules call.
//
// The `DevRuntime` base class is injected into the chunk by Rolldown's dev-mode transform
// (verified: `typeof DevRuntime` is `function`), so the WX host only extends it.
//
// Delivery is passive: every valid hmr/patches.js payload is merged into a version-keyed
// store and acknowledged with the stored version. After the re-executing Page finishes its
// synchronous evaluation, the stored factories run in version order (the apply walk);
// storing the same version twice (a second Page requiring the same patches.js) is idempotent.

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

/** Per-module hot state: holds the generated accept callback for the update propagation. */
class WxHotContext {
    readonly _internal = {
        updateStyle(): void {},
        removeStyle(): void {}
    }

    private acceptCallback: ((nextExports: unknown) => void) | undefined

    accept(callback?: (nextExports: unknown) => void): void {
        this.acceptCallback = callback
    }

    /** Invokes the registered accept callback with the module's fresh exports. */
    runAccept(nextExports: unknown): void {
        this.acceptCallback?.(nextExports)
    }

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

    /** Stored HostPatch factories keyed by absolute version; delivered, not yet executed. */
    private readonly patches = new Map<number, () => void>()

    /** Delivered: the highest version the runtime has stored; the host compares its own count against this. */
    private storedVersion = 0

    /** The shared module hot context; per-program pairing is preserved by microtask FIFO order. */
    private readonly hotContext = new WxHotContext()

    /** Executed: the highest version whose factory has run; advanced by the apply walk. */
    private appliedVersion = 0

    constructor() {
        // The base batches executed-module ids and hands them to this messenger; each batch is
        // one modules report.
        super(
            {
                send: ({ modules }) => {
                    if (modules.length > 0) {
                        // Snapshot the batch: the base clears its internal cache array right
                        // after send(), and wx.request may serialize the payload later.
                        this.reportModules([...modules])
                    }
                }
            },
            ''
        )
    }

    /**
     * Generated code always calls this before registerModule and reads `_internal` from the
     * return value. One shared context: each program's accept registration is queued before
     * its own propagation microtask, so the callback is consumed before the next program
     * overwrites it.
     */
    override createModuleHotContext(_moduleId: string): WxHotContext {
        return this.hotContext
    }

    /**
     * HMR propagation entry called at the end of every patch program. The program already
     * re-registered the changed modules, so the fresh exports are live in the registry; the
     * accept callback (which enqueues React Refresh) is registered in a microtask queued
     * during the body, so the propagation is queued after it and runs in FIFO order.
     */
    override applyUpdates(boundaries: [string, string][]): void {
        queueMicrotask(() => {
            for (const [changedId] of boundaries) {
                this.hotContext.runAccept(this.loadExports(changedId))
            }
        })
    }

    /** Consumed once per App heap from hmr/info.js; the host buildId is the Rolldown client ID. */
    initialize(info: HmrInfo): void {
        if (this.hmrInfo) {
            return
        }
        this.hmrInfo = info
        this.clientId = info.buildId
        // Anchor: the host publishes only after a version report, so the first report must
        // exist before the first edit can publish anything.
        this.reportVersion()
    }

    /** The only direct effect of hmr/patches.js: validate and store. */
    storePatches(payload: PatchPayload): void {
        const info = this.hmrInfo
        if (!info || payload.buildId !== info.buildId) {
            console.warn('[vite-plugin-taro] patches for a stale build')
            return
        }

        for (const patch of payload.patches) {
            this.patches.set(patch.version, patch.factory)
            if (patch.version > this.storedVersion) {
                this.storedVersion = patch.version
            }
        }

        // Delivery receipt: the report carries the stored version, so the host stops
        // publishing once the runtime has received the suffix.
        this.reportVersion()

        // Apply synchronously: the page's imports below the require resolve against the
        // freshly registered modules, so the re-executed Page evaluates with the new code.
        this.applyPatches()
    }

    /**
     * Runs every stored factory from appliedVersion upward. Programs register the new module
     * code with the base runtime, and the re-executing Page's imports (which follow the
     * patches.js require) resolve against it. Synchronous and atomic: WX patch programs have
     * no async, so no checkpoints or concurrency guard are needed.
     */
    private applyPatches(): void {
        while (this.appliedVersion < this.patches.size) {
            const version = this.appliedVersion + 1
            const factory = this.patches.get(version)
            if (!factory) {
                // A gap can only come from a corrupted payload; stop and surface it instead
                // of spinning. A reload re-syncs from the host.
                console.warn(`[vite-plugin-taro] patch version ${version} missing; apply stopped`)
                break
            }
            factory()
            this.appliedVersion = version
        }
    }

    /** Reports executed module ids so the host can register them with the Rolldown engine. */
    private reportModules(modules: string[]): void {
        void this.sendReport({ kind: 'modules', modules })
    }

    /** Reports the stored version; the host publishes the missing suffix when it is behind. */
    private reportVersion(): void {
        void this.sendReport({ kind: 'version', version: this.storedVersion })
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
// AppService scope does not resolve free variables against `global` (verified: the free
// lookup is undefined while the member access exists), so the renderer would never inject
// otherwise. `??=` keeps a pre-installed hook (e.g. a real DevTools integration) intact.
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
// node types declare `global` as typeof globalThis, so the AppService global needs a cast.
;(
    global as {
        /** React DevTools hook installed by the dev runtime; free-variable reads never resolve it. */
        __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown
    }
).__REACT_DEVTOOLS_GLOBAL_HOOK__ ??= reactDevtoolsHook
