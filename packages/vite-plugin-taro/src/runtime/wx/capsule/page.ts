// App and Page shells activate independently; make Current.app initialization an explicit prerequisite for Page mount.
import './app.ts'

// @ts-expect-error: The wx build replaces this private import with the configured Page component.
import PageComponent from '\0vpt:page-component'
import { Current, createPageConfig, document, injectPageInstance } from './taro-runtime.ts'

declare const __VITE_PLUGIN_TARO_PAGE_PATH__: string
declare const __VITE_PLUGIN_TARO_PAGE_CONFIG__: Record<string, unknown>

const config = createPageConfig(
    PageComponent,
    __VITE_PLUGIN_TARO_PAGE_PATH__,
    { root: { cn: [] } },
    __VITE_PLUGIN_TARO_PAGE_CONFIG__
)

export default config

// HMR

type LifecycleHandler = (this: unknown, ...args: unknown[]) => void

/** Forwards a call with the native page instance as `this`, matching Taro's invocation. */
function forward(handler: unknown, receiver: unknown, args: unknown[]): void {
    ;(handler as LifecycleHandler | undefined)?.apply(receiver, args)
}

/** The surviving page identity: its unique path and params. */
type PageIdentity = {
    $taroPath: string
    $taroParams: Record<string, unknown>
}

// DevTools re-executes the page and replays the replacement lifecycle on every edit. Taro's
// onUnload unmounts the React tree and onLoad mounts a fresh one, destroying state. While
// the runtime says a patch was just delivered, the pair is intercepted instead: onUnload
// captures the surviving page identity, and onLoad restores it onto the replacement native
// instance and rebinds the retained tree to it (pageElement.ctx + a full re-render). The
// capsule module is cached across re-executions, so this closure holds the capture.
// Ordinary navigation (no patch) passes through unchanged. The wrappers are regular
// functions so the native page instance (`this`) reaches the original handlers.
if (typeof __rolldown_runtime__ !== 'undefined') {
    const originalOnUnload = config.onUnload
    const originalOnLoad = config.onLoad
    const originalOnShow = config.onShow

    let captured: PageIdentity | undefined

    config.onUnload = function (this: unknown, ...args: unknown[]) {
        if (__rolldown_runtime__.isHotReloading()) {
            const instance = this as unknown as PageIdentity
            captured = {
                $taroPath: instance.$taroPath,
                $taroParams: instance.$taroParams
            }
            return
        }
        forward(originalOnUnload, this, args)
    }
    config.onLoad = function (this: unknown, ...args: unknown[]) {
        if (__rolldown_runtime__.isHotReloading() && captured) {
            // Restore the surviving page identity onto the replacement native instance: the
            // re-loaded $taroPath embeds a fresh timestamp, so without this the tree and the
            // native side would disagree on the page key.
            const instance = this as unknown as PageIdentity
            instance.$taroPath = captured.$taroPath
            instance.$taroParams = captured.$taroParams
            // Rebind the retained tree to the replacement receiver and resync the native
            // data: updateChildNodes enqueues the full hydrated node tree (root.cn) — the
            // surviving tree's mutations were consumed long ago, so without it the payload
            // queue is empty and the new receiver renders nothing.
            injectPageInstance(instance as unknown as Parameters<typeof injectPageInstance>[0], captured.$taroPath)
            Current.page = instance as unknown as typeof Current.page
            const pageElement = document.getElementById(captured.$taroPath) as unknown as {
                ctx: unknown
                updateChildNodes: () => void
                performUpdate: (initRender?: boolean) => void
            }
            pageElement.ctx = instance
            pageElement.updateChildNodes()
            pageElement.performUpdate(true)
            return
        }
        forward(originalOnLoad, this, args)
    }
    config.onShow = function (this: unknown, ...args: unknown[]) {
        if (__rolldown_runtime__.isHotReloading()) {
            // The window ends at the first show; the user's onShow must not re-run on a
            // synthetic re-execution (it could reset state).
            __rolldown_runtime__.clearHotReloading()
            return
        }
        forward(originalOnShow, this, args)
    }
}
