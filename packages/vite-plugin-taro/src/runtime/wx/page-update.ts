/**
 * Coordinates page-side update execution after the Rolldown and Taro runtimes exist.
 *
 * This module is intentionally page-only: it suppresses DevTools' synthetic lifecycles, preserves the Taro root,
 * commits React Refresh, and relaunches stale component families. HTTP transport remains in update-client.ts.
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

type WxPageUpdateCoordinator = {
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
    __VITE_PLUGIN_TARO_WX_PAGE_UPDATE__?: WxPageUpdateCoordinator
    __VITE_PLUGIN_TARO_WX_UPDATE_CLIENT__?: WxUpdateClient
    getCurrentPages(): Array<{ route?: string }>
    wx: {
        reLaunch(options: { url: string }): void
    }
}

const wxRuntimeGlobal = globalThis as WxRuntimeGlobal
wxRuntimeGlobal.__VITE_PLUGIN_TARO_WX_PAGE_UPDATE__ ??= { ready: false }
const bridge = wxRuntimeGlobal.__VITE_PLUGIN_TARO_WX_PAGE_UPDATE__
const refreshBoundary = { default: function WxRefreshBoundary() {} }
const registeredRoutes = new Set<string>()
const ignoredPages = new WeakSet<WxPage>()

type PageRuntimeState = Readonly<{
    activePage?: WxPage
    pendingUpdate?: { page?: WxPage; root?: TaroRoot }
    suppressLifecycles: boolean
}>

type PageRuntimeEvent =
    | { type: 'page-activated'; page: WxPage }
    | { type: 'page-unloaded'; page: WxPage }
    | { type: 'update-started'; root?: TaroRoot }
    | { type: 'suppression-ended' }
    | { type: 'refresh-finished' }

let pageRuntimeState: PageRuntimeState = { suppressLifecycles: false }

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
        if (pageRuntimeState.suppressLifecycles) {
            ignoredPages.add(this)
            this.$taroPath = pageRuntimeState.activePage?.$taroPath
            this.$taroParams = pageRuntimeState.activePage?.$taroParams
            dispatchPageRuntime({ type: 'page-activated', page: this })
            return
        }
        const result = onLoad?.apply(this, args)
        dispatchPageRuntime({ type: 'page-activated', page: this })
        return result
    }
    wrapLifecycle(config, 'onReady', applyPendingPageUpdate)
    wrapLifecycle(config, 'onShow', function () {
        dispatchPageRuntime({ type: 'page-activated', page: this })
    })
    wrapLifecycle(config, 'onHide')
    wrapLifecycle(config, 'onUnload', function () {
        dispatchPageRuntime({ type: 'page-unloaded', page: this })
    })
    return config
}

function wrapLifecycle(config: WxPageConfig, name: string, after?: PageLifecycle): void {
    const original = getLifecycle(config, name)
    config[name] = function (this: WxPage, ...args: unknown[]) {
        if (pageRuntimeState.suppressLifecycles) return
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

function applyPendingPageUpdate(): void {
    bridge.ready = true
    const pendingUpdate = bridge.pendingUpdate
    if (pendingUpdate) {
        delete bridge.pendingUpdate
        pendingUpdate()
    }
    wxRuntimeGlobal.__VITE_PLUGIN_TARO_WX_UPDATE_CLIENT__?.routeReady()
}

function getActiveTaroRoot(): TaroRoot | undefined {
    const page = pageRuntimeState.activePage
    if (!page?.$taroPath) return
    return (document.getElementById(page.$taroPath) as TaroRoot | null) ?? undefined
}

bridge.enqueueRefresh = () => {
    validateRefreshBoundaryAndEnqueueUpdate('vite-plugin-taro-wx', refreshBoundary, refreshBoundary)
}

bridge.beginUpdate = () => {
    bridge.blockRefreshRegistration = false
    wxRuntimeGlobal.__rolldown_runtime__?.beginPatch?.()
    dispatchPageRuntime({ type: 'update-started', root: getActiveTaroRoot() })
    refreshTaroRoot(pageRuntimeState.pendingUpdate?.root, pageRuntimeState.pendingUpdate?.page)
    runInNextNativeTask(() => dispatchPageRuntime({ type: 'suppression-ended' }))
}

bridge.endUpdate = () => {
    wxRuntimeGlobal.__rolldown_runtime__?.endPatch?.()
    bridge.blockRefreshRegistration = true
    bridge.enqueueRefresh?.()
}

bridge.afterRefresh = (update) => {
    bridge.blockRefreshRegistration = false
    const pendingUpdate = pageRuntimeState.pendingUpdate
    dispatchPageRuntime({ type: 'refresh-finished' })
    const page = pendingUpdate?.page
    const root = pendingUpdate?.root

    const stale = Boolean(update?.staleFamilies?.size)
    if (stale) {
        wxRuntimeGlobal.__VITE_PLUGIN_TARO_WX_UPDATE_CLIENT__?.refreshCompleted(true)
        relaunchActiveRoute(page)
        return
    }
    runInNextNativeTask(() => {
        refreshTaroRoot(root, pageRuntimeState.activePage ?? page)
        wxRuntimeGlobal.__VITE_PLUGIN_TARO_WX_UPDATE_CLIENT__?.refreshCompleted(false)
    })
}

function dispatchPageRuntime(event: PageRuntimeEvent): void {
    pageRuntimeState = transitionPageRuntime(pageRuntimeState, event)
}

function transitionPageRuntime(state: PageRuntimeState, event: PageRuntimeEvent): PageRuntimeState {
    switch (event.type) {
        case 'page-activated':
            return { ...state, activePage: event.page }
        case 'page-unloaded':
            return state.activePage === event.page ? { ...state, activePage: undefined } : state
        case 'update-started':
            return {
                ...state,
                pendingUpdate: { page: state.activePage, root: event.root },
                suppressLifecycles: true
            }
        case 'suppression-ended':
            return { ...state, suppressLifecycles: false }
        case 'refresh-finished':
            return { ...state, pendingUpdate: undefined }
    }
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
    runInNextNativeTask(() => wxRuntimeGlobal.wx.reLaunch({ url: `/${route}${query ? `?${query}` : ''}` }))
}

/**
 * DevTools dispatches synthetic page lifecycles after the changed module returns. A macrotask—not a microtask—runs
 * after that native turn and also avoids navigation or Taro root mutation from inside React Refresh's callback.
 */
function runInNextNativeTask(task: () => void): void {
    setTimeout(task)
}
