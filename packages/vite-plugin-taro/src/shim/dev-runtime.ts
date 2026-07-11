import '@tarojs/plugin-platform-weapp/dist/runtime.js'
import * as TaroApi from 'virtual:taro/api'
import * as TaroComponents from 'virtual:taro/components'
import { document } from '@tarojs/runtime'
import * as React from 'react'
import * as ReactJsxDevRuntime from 'react/jsx-dev-runtime'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import { WxModuleRuntime } from './module-runtime.ts'

type WechatPage = {
    $taroPath?: string
    $taroParams?: Record<string, unknown>
}

type TaroPageRoot = {
    ctx: WechatPage | null
    updateChildNodes: () => void
    performUpdate: (initRender?: boolean) => void
}

type PageComponent = React.ComponentType<Record<string, unknown>> & { behaviors?: unknown[] }
type PageConfig = Record<string, unknown>
type PageLifecycle = (this: WechatPage, ...args: unknown[]) => unknown

type WxGlobal = typeof globalThis & {
    wx: {
        reLaunch: (options: { url: string }) => void
    }
    __VITE_PLUGIN_TARO_WX_HMR__?: WxModuleRuntime
    getCurrentPages: () => Array<{ route?: string }>
}

const wxGlobal = globalThis as WxGlobal

// Everything in this file is WeChat/Taro glue. The module loader itself stays platform-independent.
let activePage: WechatPage | undefined
let suppressPageLifecycles = false
const registeredPages = new Set<string>()
const ignoredPages = new WeakSet<WechatPage>()

const runtime = new WxModuleRuntime({
    preparePageRefresh: () => {
        const page = activePage
        const root = captureTaroPageRoot(page)
        if (!root) return

        // DevTools emits a synthetic page lifecycle sequence when update.js changes.
        // Ignore it for this task so it cannot replace Taro's live root.
        suppressPageLifecycles = true
        setTimeout(() => {
            suppressPageLifecycles = false
        })
        return () => refreshTaroPageRoot(root, page)
    },
    reloadActivePage,
    reportError: (error) => console.error('[vite-plugin-taro] wx HMR apply failed', error)
})

runtime.registerExternal('react', React)
runtime.registerExternal('react/jsx-runtime', ReactJsxRuntime)
runtime.registerExternal('react/jsx-dev-runtime', ReactJsxDevRuntime)
runtime.registerExternal('virtual:taro/api', TaroApi)
runtime.registerExternal('virtual:taro/components', TaroComponents)
wxGlobal.__VITE_PLUGIN_TARO_WX_HMR__ = runtime

export function getWxHmrAppComponent(): React.ComponentType<{ children?: React.ReactNode }> {
    return runtime.getAppComponent() as React.ComponentType<{ children?: React.ReactNode }>
}

export function createWxHmrPageProxy(route: string): PageComponent {
    const initialComponent = runtime.getPageComponent(route) as PageComponent

    // Native Page registration keeps this component identity; only its implementation changes.
    function WxHmrPageProxy(props: Record<string, unknown>) {
        // The proxy is host code, so explicitly rerender it after application factories change.
        React.useSyncExternalStore(runtime.subscribe, runtime.getRevision, runtime.getRevision)
        const Component = runtime.getPageComponent(route) as PageComponent
        return React.createElement(Component, props)
    }

    return Object.assign(WxHmrPageProxy, { behaviors: initialComponent.behaviors })
}

/** Executes native Page registration only once per App Service. */
export function registerWxHmrPage(route: string, register: () => void): void {
    if (registeredPages.has(route)) return
    register()
    registeredPages.add(route)
}

/** Tracks the active native page and filters DevTools' synthetic lifecycle calls. */
export function decorateWxHmrPageConfig(config: PageConfig): PageConfig {
    const onLoad = getPageLifecycle(config, 'onLoad')
    config.onLoad = function (this: WechatPage, ...args: unknown[]) {
        if (suppressPageLifecycles) {
            ignoredPages.add(this)
            return
        }
        const result = onLoad?.apply(this, args)
        activePage = this
        return result
    }
    wrapPageLifecycle(config, 'onReady')
    wrapPageLifecycle(config, 'onShow', function () {
        activePage = this
    })
    wrapPageLifecycle(config, 'onHide')
    wrapPageLifecycle(config, 'onUnload', function () {
        if (activePage === this) activePage = undefined
    })
    return config
}

function wrapPageLifecycle(config: PageConfig, name: string, after?: PageLifecycle): void {
    const original = getPageLifecycle(config, name)
    config[name] = function (this: WechatPage, ...args: unknown[]) {
        if (suppressPageLifecycles) return
        if (ignoredPages.has(this)) {
            if (name === 'onUnload') ignoredPages.delete(this)
            return
        }
        const result = original?.apply(this, args)
        after?.apply(this, args)
        return result
    }
}

function getPageLifecycle(config: PageConfig, name: string): PageLifecycle | undefined {
    return typeof config[name] === 'function' ? (config[name] as PageLifecycle) : undefined
}

// Taro does not expose a public flush API, so keep this small private-runtime adapter in one place.
function captureTaroPageRoot(page: WechatPage | undefined): TaroPageRoot | undefined {
    if (!page?.$taroPath) return
    const root = document.getElementById(page.$taroPath) as TaroPageRoot | null
    if (!root) return
    // Flush once before Refresh to bind the retained root to the live native page.
    refreshTaroPageRoot(root, page)
    return root
}

function refreshTaroPageRoot(root: TaroPageRoot, page: WechatPage | undefined): void {
    if (page) root.ctx = page
    root.updateChildNodes()
    root.performUpdate(true)
}

/** Incompatible Hook signatures cannot preserve state; relaunch the route with its query. */
function reloadActivePage(): void {
    const page = activePage
    if (!page) return
    const query = Object.entries(page.$taroParams ?? {})
        .filter(([key, value]) => key !== '$taroTimestamp' && value !== undefined)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&')
    const route = wxGlobal.getCurrentPages().at(-1)?.route
    if (!route) return
    setTimeout(() => wxGlobal.wx.reLaunch({ url: `/${route}${query ? `?${query}` : ''}` }))
}
