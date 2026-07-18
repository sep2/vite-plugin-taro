import type { Messenger, DevRuntime as RolldownDevRuntime } from 'rolldown/experimental/runtime-types'

type DevRuntimeConstructor = new (messenger: Messenger, clientId: string) => RolldownDevRuntime

type DevRuntimeGlobal = {
    __rolldown_runtime__?: RolldownDevRuntime
}

declare const global: DevRuntimeGlobal
declare const DevRuntime: DevRuntimeConstructor

class WxHotContext {
    readonly moduleId: string
    readonly data: Record<string, unknown> = {}
    readonly _internal = {
        updateStyle(): void {},
        removeStyle(): void {}
    }

    constructor(moduleId: string) {
        this.moduleId = moduleId
    }

    accept(): void {}
    acceptExports(): void {}
    dispose(): void {}
    prune(): void {}
    invalidate(): void {}
    on(): void {}
    off(): void {}
    send(): void {}
}

class WxDevRuntime extends DevRuntime {
    constructor() {
        super({ send(): void {} }, 'vite-plugin-taro-wx')
    }

    override createModuleHotContext(moduleId: string): WxHotContext {
        return new WxHotContext(moduleId)
    }

    override applyUpdates(_boundaries: [string, string][]): void {}
}

global.__rolldown_runtime__ = new WxDevRuntime()
