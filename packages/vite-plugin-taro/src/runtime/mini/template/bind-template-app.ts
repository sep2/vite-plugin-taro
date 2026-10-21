import {
    document,
    hydrate,
    type MiniElementData,
    type MpInstance,
    type ReactPageComponent
} from 'vite-plugin-taro-runtime/runtime/mini'
import type { MiniHost } from '../vpt/mini-host.d.ts'

/**
 * Mini App/Page presentation
 * --------------------------
 * React owns one root in which every Page remains an ordinary child of the singleton App. Native template rendering,
 * however, is driven by independent Page.setData surfaces. The App host's app.* scheduler fans its granular deltas into
 * every mounted Page, while the framework places one opaque outlet at App {children}. Each new Page receives the current
 * App snapshot alongside its own page.* payloads in the first native batch. hydrate() supplies that initial App snapshot;
 * its traversal stops at the outlet so Page roots stay in the React/Taro ownership tree rather than entering App data.
 *
 * VPT coordinates Mini Page mounting within the singleton React App. This adapter connects
 * that tree to native presentation. H5 uses its browser App entry and upstream external mounting.
 */
export const bindTemplateApp: MiniHost['bindApp'] = (app, container) => {
    // 捕获 createVptApp 传入的确切容器，使所有 Page 的延迟快照始终来自同一个 App。
    /*
     * The logical document gives this App container the TaroRootElement class, so it serves simultaneously as React's
     * existing host container and Taro's App scheduler. Its structural _path is app and its _root is itself; ordinary
     * descendant mutations therefore join the App's granular batch. The App supplies only the native setData sink that
     * fans that batch across Page surfaces. Each Page root receives its full native ctx separately during onLoad.
     */
    Object.defineProperty(container, 'ctx', { value: { setData: broadcastAppUpdate } })

    const mount = app.mount
    app.mount = (
        component: ReactPageComponent,
        id: string,
        getCtx: (() => MpInstance) | undefined,
        complete: () => void
    ) => {
        const onCommit = () => {
            /*
             * React has now committed the Page root, but VPT has not yet attached the Page's native ctx or
             * called performUpdate(true). Enqueue a lazy app.cn snapshot beside the Page root's already-pending page.*
             * payloads. Taro resolves both in one initial setData, so the first native frame contains the App layout and
             * its Page content together. The existing mount callback then binds the native context and continues the
             * ordinary lifecycle path; snapshot seeding belongs to this commit boundary rather than Page-ready timing.
             *
             * hydrate() stops at the outlet before reaching Page roots. The snapshot reads the captured App host when
             * Taro flushes its existing batch, preserving the final committed layout and the live React/Taro ancestry.
             */
            document.getElementById(id)!.enqueueUpdate({
                path: 'app.cn',
                // Element hydration always supplies cn; the shared type also describes text and partial records.
                value: () => (hydrate(container) as MiniElementData).cn!
            })
            complete()
        }
        mount.call(app, component, id, getCtx, onCommit)
    }
}

/**
 * One App reconciliation produces one granular app.* batch, while each mounted native Page stores its own App mirror.
 * Resolve the native stack only when that batch flushes, so native routing remains the authority for retained and current
 * Pages. The stack is ordered from the oldest hidden Page to the current visible Page; iteration dispatches all hidden
 * surfaces first. Only the final current Page receives Taro's callback: every setData call has then been issued, and the
 * scheduler completes its batch exactly once. This completion acknowledges dispatch across the stack and the current
 * Page's callback, rather than waiting for separate acknowledgements from every hidden Page. An empty stack completes
 * immediately because the logical App can commit before any native Page is mounted.
 */
function broadcastAppUpdate(data: Record<string, unknown>, complete: () => void): void {
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]

    if (!currentPage) {
        complete()
        return
    }

    for (const page of pages) {
        if (page === currentPage) {
            page.setData(data, complete)
        } else {
            page.setData(data)
        }
    }
}
