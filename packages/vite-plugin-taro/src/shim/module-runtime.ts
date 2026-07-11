import * as RefreshRuntime from 'react-refresh/runtime'

type ModuleRecord = { exports: unknown }
type ModuleFactory = (
    module: ModuleRecord,
    exports: Record<string, unknown>,
    require: (specifier: string) => unknown
) => void

type RuntimeSnapshot = {
    version: number
    factories: Record<string, ModuleFactory>
    appRoot: string
    pageRoots: Record<string, string>
}

type RefreshGlobals = typeof globalThis & {
    $RefreshReg$?: (type: unknown, id: string) => void
    $RefreshSig$?: typeof RefreshRuntime.createSignatureFunctionForTransform
}

export type WxModuleRuntimeHooks = {
    preparePageRefresh: () => (() => void) | undefined
    reloadActivePage: () => void
    reportError: (error: unknown) => void
}

/**
 * Small CommonJS loader used because WeChat cannot execute Vite's development ESM graph.
 *
 * Every accepted update replaces the complete application factory set and clears evaluated
 * application modules. React Refresh preserves compatible component state; module-local state
 * intentionally resets. This is less clever than incremental graph invalidation and much easier
 * to reason about.
 */
export class WxModuleRuntime {
    private factories = new Map<string, ModuleFactory>()
    private modules = new Map<string, ModuleRecord>()
    private externals = new Map<string, unknown>()
    private pageRoots: Record<string, string> = {}
    private appRoot = ''
    private version = -1
    private loadedRoutes = new Set<string>()
    private revision = 0
    private listeners = new Set<() => void>()
    private readonly hooks: WxModuleRuntimeHooks

    constructor(hooks: WxModuleRuntimeHooks) {
        this.hooks = hooks
    }

    registerExternal(id: string, value: unknown): void {
        this.externals.set(id, value)
    }

    applySnapshot(snapshot: RuntimeSnapshot): void {
        if (snapshot.version <= this.version) return
        this.installSnapshot(snapshot)
        if (this.version === 0) return

        const finishPageRefresh = this.hooks.preparePageRefresh()
        try {
            // Evaluate every mounted root before Refresh runs so all component families are registered.
            this.requireModule(this.appRoot)
            for (const route of this.loadedRoutes) this.requireModule(this.pageRoots[route])
        } catch (error) {
            this.hooks.reportError(error)
            this.hooks.reloadActivePage()
            return
        }

        queueMicrotask(() => {
            const update = RefreshRuntime.performReactRefresh()
            if (update?.staleFamilies.size) {
                this.hooks.reloadActivePage()
                return
            }

            this.revision++
            for (const listener of this.listeners) listener()
            if (finishPageRefresh) setTimeout(finishPageRefresh)
        })
    }

    getAppComponent(): unknown {
        return getDefaultExport(this.requireModule(this.appRoot))
    }

    getPageComponent(route: string): unknown {
        this.loadedRoutes.add(route)
        return getDefaultExport(this.requireModule(this.pageRoots[route]))
    }

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    getRevision = (): number => this.revision

    private installSnapshot(snapshot: RuntimeSnapshot): void {
        this.version = snapshot.version
        this.factories = new Map(Object.entries(snapshot.factories))
        this.modules.clear()
        this.appRoot = snapshot.appRoot
        this.pageRoots = snapshot.pageRoots
    }

    private requireModule(id: string): unknown {
        const external = this.externals.get(id)
        if (external !== undefined) return external

        const normalizedId = normalizeModuleId(id)
        const existing = this.modules.get(normalizedId)
        if (existing) return existing.exports

        const factory = this.factories.get(normalizedId)
        if (!factory) throw new Error(`wx HMR cannot require ${JSON.stringify(id)}.`)

        // Cache before execution to support CommonJS cycles.
        const initialExports: Record<string, unknown> = {}
        const module: ModuleRecord = { exports: initialExports }
        this.modules.set(normalizedId, module)

        const refreshGlobal = globalThis as RefreshGlobals
        const previousRegister = refreshGlobal.$RefreshReg$
        const previousSignature = refreshGlobal.$RefreshSig$
        refreshGlobal.$RefreshReg$ = (type, localId) => RefreshRuntime.register(type, `${normalizedId} ${localId}`)
        refreshGlobal.$RefreshSig$ = RefreshRuntime.createSignatureFunctionForTransform
        try {
            factory(module, initialExports, (specifier) => this.requireModule(resolveImport(normalizedId, specifier)))
            return module.exports
        } catch (error) {
            this.modules.delete(normalizedId)
            throw error
        } finally {
            refreshGlobal.$RefreshReg$ = previousRegister
            refreshGlobal.$RefreshSig$ = previousSignature
        }
    }
}

function resolveImport(importer: string, specifier: string): string {
    if (!specifier.startsWith('.')) return specifier
    return normalizeModuleId(`${importer.slice(0, importer.lastIndexOf('/') + 1)}${specifier}`)
}

function normalizeModuleId(id: string): string {
    const segments: string[] = []
    for (const segment of id.replace(/\\/g, '/').split('/')) {
        if (!segment || segment === '.') continue
        if (segment === '..') segments.pop()
        else segments.push(segment)
    }
    return `/${segments.join('/')}`
}

function getDefaultExport(exports: unknown): unknown {
    if ((typeof exports === 'object' && exports !== null) || typeof exports === 'function') {
        if ('default' in exports) return exports.default
    }
    return exports
}
