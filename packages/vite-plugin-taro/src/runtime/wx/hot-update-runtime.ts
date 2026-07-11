/**
 * Application-side WX hot-update bridge loaded as a normal bundled module by generated page entries.
 *
 * Unlike the Rolldown bootstrap runtime, this module runs after the module system and Taro runtime exist,
 * so it can coordinate React Refresh, native page registration, Taro root retention, and route relaunches.
 */
import { document } from '@tarojs/runtime'
// @ts-expect-error Vite exposes its React Refresh runtime through this development-only virtual module.
import { validateRefreshBoundaryAndEnqueueUpdate } from '/@react-refresh'

type WxPage = {
    $taroPath?: string
    $taroParams?: Record<string, unknown>
}

type WxPageConfig = Record<string, unknown>
type PageLifecycle = (this: WxPage, ...args: unknown[]) => unknown

type TaroRoot = {
    ctx: WxPage | null
    updateChildNodes(): void
    performUpdate(initRender?: boolean): void
}

type ReactRefreshResult = {
    staleFamilies?: Set<unknown>
}

type WxRolldownRuntime = {
    beginPatch?(): void
    endPatch?(): void
}

type WxHotUpdateBridge = {
    version: number
    fullBuild?: number
    ready: boolean
    pendingUpdate?: () => void
    blockRefreshRegistration?: boolean
    enqueueRefresh?: () => void
    beginUpdate?: () => void
    endUpdate?: () => void
    afterRefresh?: (update?: ReactRefreshResult) => void
}

type WxUpdateClient = {
    refreshCompleted(stale: boolean): void
    routeReady(): void
}

type WxRuntimeGlobal = typeof globalThis & {
    __rolldown_runtime__?: WxRolldownRuntime
    __VITE_PLUGIN_TARO_WX__?: WxHotUpdateBridge
    __VITE_PLUGIN_TARO_WX_CLIENT__?: WxUpdateClient
    getCurrentPages(): Array<{ route?: string }>
    wx: {
        reLaunch(options: { url: string }): void
    }
}

const wxRuntimeGlobal = globalThis as WxRuntimeGlobal
wxRuntimeGlobal.__VITE_PLUGIN_TARO_WX__ ??= { version: 0, ready: false }
const bridge = wxRuntimeGlobal.__VITE_PLUGIN_TARO_WX__
const refreshBoundary = { default: function WxRefreshBoundary() {} }
const registeredRoutes = new Set<string>()
const ignoredPages = new WeakSet<WxPage>()
let activePage: WxPage | undefined
let pendingPage: WxPage | undefined
let pendingRoot: TaroRoot | undefined
let suppressLifecycles = false

/** Registers a native route once per App Service runtime generation. */
export function registerWxPage(route: string, register: () => void): void {
    if (registeredRoutes.has(route)) return
    register()
    registeredRoutes.add(route)
}

/** Retains Taro's live root while filtering DevTools' synthetic update lifecycles. */
export function decorateWxPageConfig(config: WxPageConfig): WxPageConfig {
    const onLoad = getLifecycle(config, 'onLoad')
    config.onLoad = function (this: WxPage, ...args: unknown[]) {
        if (suppressLifecycles) {
            ignoredPages.add(this)
            this.$taroPath = activePage?.$taroPath
            this.$taroParams = activePage?.$taroParams
            activePage = this
            return
        }
        const result = onLoad?.apply(this, args)
        activePage = this
        return result
    }
    wrapLifecycle(config, 'onReady', applyPendingUpdate)
    wrapLifecycle(config, 'onShow', function () {
        activePage = this
    })
    wrapLifecycle(config, 'onHide')
    wrapLifecycle(config, 'onUnload', function () {
        if (activePage === this) activePage = undefined
    })
    return config
}

function wrapLifecycle(config: WxPageConfig, name: string, after?: PageLifecycle): void {
    const original = getLifecycle(config, name)
    config[name] = function (this: WxPage, ...args: unknown[]) {
        if (suppressLifecycles) return
        if (ignoredPages.has(this)) {
            if (name === 'onUnload') ignoredPages.delete(this)
            return
        }
        const result = original?.apply(this, args)
        after?.apply(this, args)
        return result
    }
}

function getLifecycle(config: WxPageConfig, name: string): PageLifecycle | undefined {
    return typeof config[name] === 'function' ? (config[name] as PageLifecycle) : undefined
}

function applyPendingUpdate(): void {
    bridge.ready = true
    const pendingUpdate = bridge.pendingUpdate
    if (pendingUpdate) {
        delete bridge.pendingUpdate
        pendingUpdate()
    }
    wxRuntimeGlobal.__VITE_PLUGIN_TARO_WX_CLIENT__?.routeReady()
}

function getActiveTaroRoot(): TaroRoot | undefined {
    if (!activePage?.$taroPath) return
    return (document.getElementById(activePage.$taroPath) as TaroRoot | null) ?? undefined
}

bridge.enqueueRefresh = () => {
    validateRefreshBoundaryAndEnqueueUpdate('vite-plugin-taro-wx', refreshBoundary, refreshBoundary)
}

bridge.beginUpdate = () => {
    bridge.blockRefreshRegistration = false
    wxRuntimeGlobal.__rolldown_runtime__?.beginPatch?.()
    pendingPage = activePage
    pendingRoot = getActiveTaroRoot()
    refreshTaroRoot(pendingRoot, pendingPage)
    suppressLifecycles = true
    setTimeout(() => {
        suppressLifecycles = false
    })
}

bridge.endUpdate = () => {
    wxRuntimeGlobal.__rolldown_runtime__?.endPatch?.()
    bridge.blockRefreshRegistration = true
    bridge.enqueueRefresh?.()
}

bridge.afterRefresh = (update) => {
    bridge.blockRefreshRegistration = false
    const page = pendingPage
    const root = pendingRoot
    pendingPage = undefined
    pendingRoot = undefined

    const stale = Boolean(update?.staleFamilies?.size)
    if (stale) {
        wxRuntimeGlobal.__VITE_PLUGIN_TARO_WX_CLIENT__?.refreshCompleted(true)
        relaunchActiveRoute(page)
        return
    }
    setTimeout(() => {
        refreshTaroRoot(root, activePage ?? page)
        wxRuntimeGlobal.__VITE_PLUGIN_TARO_WX_CLIENT__?.refreshCompleted(false)
    })
}

function refreshTaroRoot(root: TaroRoot | undefined, page: WxPage | undefined): void {
    if (!root) return
    root.ctx = page ?? null
    root.updateChildNodes()
    root.performUpdate(true)
}

function relaunchActiveRoute(page: WxPage | undefined): void {
    const route = wxRuntimeGlobal.getCurrentPages().at(-1)?.route
    if (!route) return
    const query = Object.entries(page?.$taroParams ?? {})
        .filter(([key, value]) => key !== '$taroTimestamp' && value !== undefined)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&')
    setTimeout(() => wxRuntimeGlobal.wx.reLaunch({ url: `/${route}${query ? `?${query}` : ''}` }))
}
