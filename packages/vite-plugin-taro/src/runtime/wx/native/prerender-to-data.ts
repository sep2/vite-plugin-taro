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
import type { createPageConfig } from '../../mini/capsule/create-page-config.ts'
import { getWxPageQuery } from './get-wx-page-query.ts'

// One counter distinguishes native instances even when their route, query and creation timestamp match.
const pageId = incrementId()

/** Commits one Page into the existing App root and returns its initial native data without dispatching lifecycles. */
export function prerenderToData(config: ReturnType<typeof createPageConfig>): Record<string, unknown> {
    const { component, route } = config.__vpt_meta

    const params = { ...getWxPageQuery(), $taroTimestamp: Date.now() }
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
        return config.data
    }

    Current.app.mount(component, path, () => {}, true)

    const page = document.getElementById(path)
    const app = page?.parentNode?._root
    // Suspense without a committed fallback leaves the ordinary seed until a later React commit.
    if (!page || !app) {
        return config.data
    }

    // Both hosts are elements; hydrate's shared return type also includes text nodes.
    const appData = hydrate(app) as MiniElementData
    const pageData = hydrate(page) as MiniElementData

    return {
        app: { ...config.data.app, cn: appData.cn },
        page: { ...config.data.page, cn: pageData.cn }
    }
}
