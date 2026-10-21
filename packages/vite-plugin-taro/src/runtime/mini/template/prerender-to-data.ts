import { flushSync } from 'vite-plugin-taro-runtime/react'
import {
    addLeadingSlash,
    Current,
    type createPageConfig,
    document,
    getOnHideEventKey,
    getOnReadyEventKey,
    getOnShowEventKey,
    hydrate,
    type MiniElementData
} from 'vite-plugin-taro-runtime/runtime/mini'
import type { createPageIdentity } from '../vpt/create-page-identity.ts'
import type { TemplatePageData } from './template-page-data.d.ts'

/** Commits one Page into the existing App root and returns its initial native data without dispatching lifecycles. */
export function prerenderToData(
    component: Parameters<typeof createPageConfig>[0],
    route: string,
    identity: ReturnType<typeof createPageIdentity>,
    initialData: TemplatePageData
): TemplatePageData {
    const { path, params } = identity

    Current.router = {
        params,
        path: addLeadingSlash(route),
        $taroPath: path,
        onReady: getOnReadyEventKey(route),
        onShow: getOnShowEventKey(route),
        onHide: getOnHideEventKey(route)
    }

    flushSync(() => {
        Current.app!.mount!(component, path, undefined, () => {})
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
