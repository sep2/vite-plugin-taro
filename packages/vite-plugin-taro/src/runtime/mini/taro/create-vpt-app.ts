import React from 'react'
import { createReactApp } from 'vite-plugin-taro-runtime/plugin-framework-react/runtime'
import ReactDOM from 'vite-plugin-taro-runtime/react'
import { document, hydrate, type MiniElementData, type ReactPageComponent } from 'vite-plugin-taro-runtime/runtime/mini'

// Import here to make sure this is called before any pages
import './get-page-query.ts'

/**
 * Mini App/Page presentation
 * --------------------------
 * React owns one root in which every Page remains an ordinary child of the singleton App. Native template rendering,
 * however, is driven by independent Page.setData surfaces. The App host's app.* scheduler fans its granular deltas into
 * every mounted Page, while the framework places one opaque outlet at App {children}. Each new Page receives the current
 * App snapshot alongside its own page.* payloads in the first native batch. hydrate() supplies that initial App snapshot;
 * its traversal stops at the outlet so Page roots stay in the React/Taro ownership tree rather than entering App data.
 *
 * Taro owns Mini Program lifecycle mounting and retains the singleton React App across Page mounts. This adapter connects
 * that existing tree to native presentation. H5 uses its browser App entry and upstream external mounting.
 */
export function createVptApp(
    App: Parameters<typeof createReactApp>[0],
    appConfig: Parameters<typeof createReactApp>[3]
) {
    const app = createReactApp(App, React, ReactDOM, appConfig)
    /*
     * Taro creates the Mini App container synchronously, while React mounting follows its ordinary concurrent timing.
     * Resolve the same configured appId that Taro passed to ReactDOM and retain that exact host. The delegated mount
     * callback closes over this immutable identity, so every initial Page snapshot comes from the same singleton App tree.
     */
    const container = document.getElementById(appConfig.appId || 'app')!

    /*
     * The logical document gives this App container the TaroRootElement class, so it serves simultaneously as React's
     * existing host container and Taro's App scheduler. Its structural _path is app and its _root is itself; ordinary
     * descendant mutations therefore join the App's granular batch. The App supplies only the native setData sink that
     * fans that batch across Page surfaces. Each Page root receives its full native ctx separately during onLoad.
     */
    Object.defineProperty(container, 'ctx', { value: { setData: broadcastAppUpdate } })

    const mount = app.mount
    app.mount = (component: ReactPageComponent, id: string, complete: () => void) => {
        mount.call(app, component, id, () => {
            /*
             * React has now committed the Page root, but createPageConfig has not yet attached the native Page ctx or
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
        })
    }

    return app
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
