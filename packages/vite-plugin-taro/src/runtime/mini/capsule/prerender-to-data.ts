import { flushSync } from 'vite-plugin-taro-runtime/react'
import {
    addLeadingSlash,
    Current,
    document,
    getOnHideEventKey,
    getOnReadyEventKey,
    getOnShowEventKey,
    getPath,
    hydrate,
    incrementId,
    type MiniElementData
} from 'vite-plugin-taro-runtime/runtime/mini'
import { getPageQuery } from '../amphibious/vpt.ts'
import type { PageData, PrerenderPageConfig } from './create-vpt-page-config.ts'

// One counter distinguishes native instances even when their route, query and creation timestamp match.
const pageId = incrementId()

/** Commits one Page into the existing App root and returns its initial native data without dispatching lifecycles. */
export function prerenderToData(config: PrerenderPageConfig, initialData: PageData): PageData {
    const { component, route, skipPrerender } = config.__vpt_meta

    if (skipPrerender) {
        return initialData
    }

    const params = { ...getPageQuery(), $taroTimestamp: Date.now() }
    const path = getPath(route, { ...params, $vptPage: pageId() })

    // Retain this instance identity until native onLoad consumes it without remounting the Page.
    config.__vpt_meta.prerenderIdentity = { path, params }

    Current.router = {
        params,
        path: addLeadingSlash(route),
        $taroPath: path,
        onReady: getOnReadyEventKey(route),
        onShow: getOnShowEventKey(route),
        onHide: getOnHideEventKey(route)
    }

    if (!Current.app?.mount) {
        return initialData
    }

    flushSync(() => {
        Current.app!.mount!(component, path, () => {})
    })

    const page = document.getElementById(path)
    const app = page?.parentNode?._root
    // Cold App startup or Suspense without a committed fallback keeps the seed until a later React commit.
    if (!page || !app) {
        return initialData
    }

    // Both hosts are elements; hydrate's shared return type also includes text nodes.
    const appData = hydrate(app) as MiniElementData
    const pageData = hydrate(page) as MiniElementData

    return {
        app: { ...initialData.app, cn: appData.cn },
        page: { ...initialData.page, cn: pageData.cn }
    }
}
