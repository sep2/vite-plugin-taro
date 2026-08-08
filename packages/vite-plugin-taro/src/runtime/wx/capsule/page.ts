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

/** The old native projection retained while DevTools replaces its Page instance. */
type PageSnapshot = {
    $taroPath: string
    $taroParams: Record<string, unknown>
    data: Record<string, unknown>
}

type NativePage = PageSnapshot & {
    setData(data: Record<string, unknown>): void
}

// DevTools re-executes the page and replays the replacement lifecycle on every edit. Taro's
// onUnload unmounts the React tree and onLoad mounts a fresh one, destroying state. While
// the runtime says a patch was just delivered, the pair is intercepted instead: onUnload
// captures the surviving page identity and its current native render data, and onLoad
// immediately paints that snapshot before rebinding and fully synchronizing the retained
// tree. The capsule module is cached across re-executions, so this closure holds the capture.
// Ordinary navigation (no patch) passes through unchanged. The wrappers are regular
// functions so the native page instance (`this`) reaches the original handlers.
if (typeof __rolldown_runtime__ !== 'undefined') {
    const originalOnUnload = config.onUnload
    const originalOnLoad = config.onLoad
    const originalOnShow = config.onShow

    // This is the sole cross-instance handoff. It is mutable because DevTools destroys the
    // old native Page before creating its replacement; ordinary navigation never reads it.
    let captured: PageSnapshot | undefined

    config.onUnload = function (this: unknown, ...args: unknown[]) {
        if (__rolldown_runtime__.isHotReloading()) {
            const instance = this as unknown as NativePage
            captured = {
                $taroPath: instance.$taroPath,
                $taroParams: instance.$taroParams,
                // WeChat owns this serializable view-model snapshot. Retaining it is cheaper
                // than deep-cloning the complete recursive Taro node tree before every edit.
                data: instance.data
            }
            return
        }
        forward(originalOnUnload, this, args)
    }
    config.onLoad = function (this: unknown, ...args: unknown[]) {
        if (__rolldown_runtime__.isHotReloading() && captured) {
            const instance = this as unknown as NativePage
            // Paint the last native projection as the first bridge operation. Taro's full
            // performUpdate below runs in a timer, so this direct setData removes most of the
            // empty-page interval without delaying synchronization to the current tree.
            instance.setData(captured.data)
            // Restore the surviving page identity onto the replacement native instance: the
            // re-loaded $taroPath embeds a fresh timestamp, so without this the tree and the
            // native side would disagree on the page key.
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
