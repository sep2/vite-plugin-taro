import type { Messenger, DevRuntime as RolldownDevRuntime } from 'rolldown/experimental/runtime-types'

type DevRuntimeConstructor = new (messenger: Messenger, clientId: string) => RolldownDevRuntime

type HmrInfo = Readonly<{
    buildId: string
    endpoint: string
    token: string
}>

type PublicationMetadata = Readonly<{
    buildId: string
    fromVersion: number
    publicationId: number
    targetVersion: number
}>

type AcceptCallback = (exports: unknown) => void

type DependencyAcceptance = Readonly<{
    callback: AcceptCallback
    dependencies: readonly string[]
}>

type RequestResult = Readonly<{
    data?: unknown
}>

type RefreshHost = {
    enqueueRefresh(enqueue: () => void): void
    performReactRefresh(refresh: () => unknown): unknown
    __getReactRefreshIgnoredExports?: (value: { id: string }) => string[]
    __registerBeforePerformReactRefresh?: (callback: () => void | Promise<void>) => void
}

type DevRuntimeGlobal = {
    __rolldown_runtime__?: WxDevRuntime
    __vptReactRefreshHost?: RefreshHost
}

declare const global: DevRuntimeGlobal
declare const DevRuntime: DevRuntimeConstructor

const transportRetryDelay = 500
const rebuildingPollDelay = 1_000
const updateWatchdogDelay = 2_000

class WxHotContext {
    readonly data: Record<string, unknown>
    readonly _internal = {
        updateStyle(): void {},
        removeStyle(): void {}
    }

    private selfAccept: AcceptCallback | undefined
    private readonly dependencyAccepts = new Map<string, DependencyAcceptance>()
    private readonly disposeCallbacks = new Set<(data: Record<string, unknown>) => void>()
    private readonly pruneCallbacks = new Set<(data: Record<string, unknown>) => void>()

    constructor(
        readonly moduleId: string,
        data: Record<string, unknown>,
        private readonly runtime: WxDevRuntime
    ) {
        this.data = data
    }

    accept(dependencies?: string | readonly string[] | AcceptCallback, callback?: AcceptCallback): void {
        if (typeof dependencies === 'function') {
            this.selfAccept = dependencies
            return
        }
        if (typeof dependencies === 'string' || Array.isArray(dependencies)) {
            const accepted = typeof dependencies === 'string' ? [dependencies] : [...dependencies]
            this.dependencyAccepts.set(accepted.join('\0'), {
                callback: callback ?? (() => undefined),
                dependencies: accepted
            })
            return
        }
        this.selfAccept = callback ?? (() => undefined)
    }

    acceptExports(_exports: readonly string[], callback?: AcceptCallback): void {
        this.selfAccept = callback ?? (() => undefined)
    }

    dispose(callback: (data: Record<string, unknown>) => void): void {
        this.disposeCallbacks.add(callback)
    }

    prune(callback: (data: Record<string, unknown>) => void): void {
        this.pruneCallbacks.add(callback)
    }

    invalidate(message?: string): void {
        this.runtime.invalidate(message)
    }

    on(): void {}
    off(): void {}
    send(): void {}

    prepareReplacement(): void {
        for (const callback of this.disposeCallbacks) {
            callback(this.data)
        }
        this.disposeCallbacks.clear()
    }

    apply(acceptedVia: string): void {
        if (acceptedVia === this.moduleId && this.selfAccept) {
            this.selfAccept(this.runtime.loadExports(acceptedVia))
            return
        }

        for (const acceptance of this.dependencyAccepts.values()) {
            if (!acceptance.dependencies.includes(acceptedVia)) {
                continue
            }
            acceptance.callback(acceptance.dependencies.map((dependency) => this.runtime.loadExports(dependency)))
            return
        }

        this.runtime.invalidate(`No active acceptance callback for ${acceptedVia} through ${this.moduleId}.`)
    }
}

class WxDevRuntime extends DevRuntime {
    private hmrInfo: HmrInfo | undefined
    private appliedVersion = 0
    private requestPending = false
    private pollTimer: ReturnType<typeof setTimeout> | undefined
    private applyingPublication = false
    private patchInvalidated = false
    private refreshScheduled = false
    private resolveRefresh: (() => void) | undefined
    private readonly hotContexts = new Map<string, WxHotContext>()
    private readonly hotData = new Map<string, Record<string, unknown>>()

    constructor(clientId: string) {
        super({ send: ({ modules }) => this.registerModules(modules) }, clientId)
    }

    setHmrInfo(hmrInfo: HmrInfo): void {
        if (this.hmrInfo?.buildId !== hmrInfo.buildId) {
            this.appliedVersion = 0
        }
        this.hmrInfo = hmrInfo
        this.registerModules([])
        this.schedulePoll(0)
    }

    override createModuleHotContext(moduleId: string): WxHotContext {
        const existing = this.hotContexts.get(moduleId)
        if (existing) {
            if (this.applyingPublication) {
                existing.prepareReplacement()
            }
            return existing
        }

        const context = new WxHotContext(moduleId, this.hotData.get(moduleId) ?? {}, this)
        this.hotContexts.set(moduleId, context)
        this.hotData.set(moduleId, context.data)
        return context
    }

    override applyUpdates(boundaries: [string, string][]): void {
        for (const [boundary, acceptedVia] of boundaries) {
            const context = this.hotContexts.get(boundary)
            if (!context) {
                this.invalidate(`Missing HMR boundary ${boundary}.`)
                continue
            }
            context.apply(acceptedVia)
        }
    }

    async applyPublication(metadata: PublicationMetadata, apply: () => void): Promise<void> {
        const hmrInfo = this.hmrInfo
        if (!hmrInfo || metadata.buildId !== hmrInfo.buildId) {
            this.schedulePoll(0)
            return
        }
        if (metadata.targetVersion <= this.appliedVersion) {
            this.schedulePoll(0)
            return
        }
        if (
            this.applyingPublication ||
            !Number.isSafeInteger(metadata.fromVersion) ||
            !Number.isSafeInteger(metadata.targetVersion) ||
            metadata.fromVersion !== this.appliedVersion ||
            metadata.targetVersion <= metadata.fromVersion
        ) {
            this.requestFullBuild('invalid publication range')
            return
        }

        if (this.pollTimer) {
            clearTimeout(this.pollTimer)
            this.pollTimer = undefined
        }
        this.applyingPublication = true
        this.patchInvalidated = false
        this.refreshScheduled = false
        const refreshCompleted = new Promise<void>((resolve) => {
            this.resolveRefresh = resolve
        })

        try {
            apply()
            await Promise.resolve()
            if (this.patchInvalidated) {
                throw new Error('The updated module invalidated its HMR boundary.')
            }
            if (this.refreshScheduled) {
                await refreshCompleted
            }
            if (this.patchInvalidated) {
                throw new Error('React Refresh invalidated the update.')
            }
            this.appliedVersion = metadata.targetVersion
            this.schedulePoll(0)
        } catch (error) {
            console.error('[vite-plugin-taro] WX HMR patch execution failed', error)
            this.requestFullBuild('patch execution failed')
        } finally {
            this.applyingPublication = false
            this.resolveRefresh = undefined
        }
    }

    invalidate(message?: string): void {
        this.patchInvalidated = true
        if (message) {
            console.warn(`[vite-plugin-taro] ${message}`)
        }
    }

    enqueueRefresh(enqueue: () => void): void {
        this.refreshScheduled = true
        enqueue()
    }

    performReactRefresh(refresh: () => unknown): unknown {
        try {
            return refresh()
        } finally {
            this.resolveRefresh?.()
        }
    }

    private registerModules(modules: string[]): void {
        const hmrInfo = this.hmrInfo
        if (!hmrInfo) {
            return
        }

        wx.request({
            url: hmrInfo.endpoint,
            method: 'POST',
            data: {
                action: 'modules',
                buildId: hmrInfo.buildId,
                clientId: this.clientId,
                modules: modules.slice(),
                token: hmrInfo.token
            },
            header: { 'content-type': 'application/json' },
            success(): void {},
            fail(): void {},
            complete(): void {}
        })
    }

    private poll(): void {
        const hmrInfo = this.hmrInfo
        if (!hmrInfo || this.requestPending || this.applyingPublication) {
            this.schedulePoll(50)
            return
        }

        this.requestPending = true
        wx.request({
            url: hmrInfo.endpoint,
            method: 'POST',
            data: {
                action: 'poll',
                appliedVersion: this.appliedVersion,
                buildId: hmrInfo.buildId,
                clientId: this.clientId,
                token: hmrInfo.token
            },
            header: { 'content-type': 'application/json' },
            timeout: 30_000,
            success: (result: RequestResult): void => {
                const responseType = parseResponseType(result.data)
                if (responseType === 'idle') {
                    this.schedulePoll(0)
                } else if (responseType === 'update-published') {
                    this.schedulePoll(updateWatchdogDelay)
                } else if (responseType === 'rebuilding') {
                    this.schedulePoll(rebuildingPollDelay)
                } else {
                    this.schedulePoll(transportRetryDelay)
                }
            },
            fail: (): void => {
                this.schedulePoll(transportRetryDelay)
            },
            complete: (): void => {
                this.requestPending = false
            }
        })
    }

    private requestFullBuild(reason: string): void {
        const hmrInfo = this.hmrInfo
        if (!hmrInfo) {
            return
        }
        console.warn(`[vite-plugin-taro] requesting a complete WX rebuild: ${reason}`)
        wx.request({
            url: hmrInfo.endpoint,
            method: 'POST',
            data: {
                action: 'rebuild',
                buildId: hmrInfo.buildId,
                clientId: this.clientId,
                token: hmrInfo.token
            },
            header: { 'content-type': 'application/json' },
            success(): void {},
            fail(): void {},
            complete: (): void => {
                this.schedulePoll(rebuildingPollDelay)
            }
        })
    }

    private schedulePoll(delay: number): void {
        if (this.pollTimer) {
            clearTimeout(this.pollTimer)
        }
        this.pollTimer = setTimeout(() => {
            this.pollTimer = undefined
            this.poll()
        }, delay)
    }
}

function parseResponseType(value: unknown): string {
    if (!value || typeof value !== 'object' || !('type' in value) || typeof value.type !== 'string') {
        return 'invalid'
    }
    return value.type
}

const runtime = new WxDevRuntime(createClientId())
global.__rolldown_runtime__ = runtime
global.__vptReactRefreshHost = {
    enqueueRefresh: (enqueue) => runtime.enqueueRefresh(enqueue),
    performReactRefresh: (refresh) => runtime.performReactRefresh(refresh)
}

function createClientId(): string {
    return `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`
}
