import { document } from '@tarojs/runtime'
// @ts-expect-error Vite exposes its React Refresh runtime through this development-only virtual module.
import { validateRefreshBoundaryAndEnqueueUpdate } from '/@react-refresh'

type WechatPage = {
    $taroPath?: string
    $taroParams?: Record<string, unknown>
}

type PageConfig = Record<string, unknown>
type PageLifecycle = (this: WechatPage, ...args: unknown[]) => unknown

type TaroRoot = {
    ctx: WechatPage | null
    updateChildNodes(): void
    performUpdate(initRender?: boolean): void
}

type RefreshResult = {
    staleFamilies?: Set<unknown>
}

type WxRolldownRuntime = {
    beginPatch?(): void
    endPatch?(): void
}

type WxDevelopmentGlobal = typeof globalThis & {
    __rolldown_runtime__?: WxRolldownRuntime
    __WX_BLOCK_REFRESH_REGISTRATION__?: boolean
    __WX_BUNDLED_RUNTIME_READY__?: boolean
    __WX_PENDING_BUNDLED_HMR__?: () => void
    __WX_ENQUEUE_REACT_REFRESH__?: () => void
    __WX_BUNDLED_HMR_BEGIN__?: () => void
    __WX_BUNDLED_HMR_END__?: () => void
    __WX_AFTER_REACT_REFRESH__?: (update?: RefreshResult) => void
    getCurrentPages(): Array<{ route?: string }>
    wx: {
        reLaunch(options: { url: string }): void
    }
}

const wxGlobal = globalThis as WxDevelopmentGlobal
const refreshBoundary = { default: function WxRefreshBoundary() {} }
const registeredRoutes = new Set<string>()
const ignoredPages = new WeakSet<WechatPage>()
let activePage: WechatPage | undefined
let pendingPage: WechatPage | undefined
let pendingRoot: TaroRoot | undefined
let suppressLifecycles = false

/** Registers a native route once per App Service runtime generation. */
export function registerWxPage(route: string, register: () => void): void {
    if (registeredRoutes.has(route)) return
    register()
    registeredRoutes.add(route)
}

/** Retains Taro's live root while filtering DevTools' synthetic update lifecycles. */
export function decorateWxPageConfig(config: PageConfig): PageConfig {
    const onLoad = getLifecycle(config, 'onLoad')
    config.onLoad = function (this: WechatPage, ...args: unknown[]) {
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

function wrapLifecycle(config: PageConfig, name: string, after?: PageLifecycle): void {
    const original = getLifecycle(config, name)
    config[name] = function (this: WechatPage, ...args: unknown[]) {
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

function getLifecycle(config: PageConfig, name: string): PageLifecycle | undefined {
    return typeof config[name] === 'function' ? (config[name] as PageLifecycle) : undefined
}

function applyPendingUpdate(): void {
    wxGlobal.__WX_BUNDLED_RUNTIME_READY__ = true
    const pendingUpdate = wxGlobal.__WX_PENDING_BUNDLED_HMR__
    if (!pendingUpdate) return
    delete wxGlobal.__WX_PENDING_BUNDLED_HMR__
    pendingUpdate()
}

function getActiveRoot(): TaroRoot | undefined {
    if (!activePage?.$taroPath) return
    return (document.getElementById(activePage.$taroPath) as TaroRoot | null) ?? undefined
}

wxGlobal.__WX_ENQUEUE_REACT_REFRESH__ = () => {
    validateRefreshBoundaryAndEnqueueUpdate('vite-plugin-taro-wx', refreshBoundary, refreshBoundary)
}

wxGlobal.__WX_BUNDLED_HMR_BEGIN__ = () => {
    wxGlobal.__WX_BLOCK_REFRESH_REGISTRATION__ = false
    wxGlobal.__rolldown_runtime__?.beginPatch?.()
    pendingPage = activePage
    pendingRoot = getActiveRoot()
    refreshTaroRoot(pendingRoot, pendingPage)
    suppressLifecycles = true
    setTimeout(() => {
        suppressLifecycles = false
    })
}

wxGlobal.__WX_BUNDLED_HMR_END__ = () => {
    wxGlobal.__rolldown_runtime__?.endPatch?.()
    wxGlobal.__WX_BLOCK_REFRESH_REGISTRATION__ = true
    wxGlobal.__WX_ENQUEUE_REACT_REFRESH__?.()
}

wxGlobal.__WX_AFTER_REACT_REFRESH__ = (update) => {
    wxGlobal.__WX_BLOCK_REFRESH_REGISTRATION__ = false
    const page = pendingPage
    const root = pendingRoot
    pendingPage = undefined
    pendingRoot = undefined

    if (update?.staleFamilies?.size) {
        relaunchActiveRoute(page)
        return
    }
    if (root) setTimeout(() => refreshTaroRoot(root, activePage ?? page))
}

function refreshTaroRoot(root: TaroRoot | undefined, page: WechatPage | undefined): void {
    if (!root) return
    root.ctx = page ?? null
    root.updateChildNodes()
    root.performUpdate(true)
}

function relaunchActiveRoute(page: WechatPage | undefined): void {
    const route = wxGlobal.getCurrentPages().at(-1)?.route
    if (!route) return
    const query = Object.entries(page?.$taroParams ?? {})
        .filter(([key, value]) => key !== '$taroTimestamp' && value !== undefined)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&')
    setTimeout(() => wxGlobal.wx.reLaunch({ url: `/${route}${query ? `?${query}` : ''}` }))
}
