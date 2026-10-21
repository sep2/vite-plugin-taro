import { Current, createPageConfig, type MpInstance, type PageInstance } from 'vite-plugin-taro-runtime/runtime/mini'
import { createPageIdentity } from '../vpt/create-page-identity.ts'
import { getPageQuery } from '../vpt/get-page-query.ts'
import { mountPage } from '../vpt/mount-page.ts'
import type { VptPageOptions } from '../vpt/vpt-page-options.d.ts'
import { prerenderToData } from './prerender-to-data.ts'
import type { TemplatePageData } from './template-page-data.d.ts'

/** Creates the App/Page template seed and optional native data factory. */
export function createTemplatePage(component: Parameters<typeof createPageConfig>[0], vptPageOptions: VptPageOptions) {
    const { path: routePath, prerender } = vptPageOptions
    // Generated templates consume one node. A transparent fragment groups App siblings and relays Page content
    // through the branch containing the outlet. Only cn changes; nn selects the stable fragment template.
    const initialData: TemplatePageData = { app: { nn: 'vpt_fragment', cn: [] }, page: { cn: [] } }

    const config = createPageConfig(component, routePath, initialData, vptPageOptions.config)
    // The data factory produces the identity consumed by this instance's native onLoad.
    let prerendered: ReturnType<typeof createPageIdentity> | undefined

    if (prerender) {
        config.data = () => {
            if (!Current.app?.mount) {
                return initialData
            }
            prerendered = createPageIdentity(routePath, getPageQuery())

            return prerenderToData(component, routePath, prerendered, initialData)
        }
    }

    const originalOnLoad = config.onLoad!
    config.onLoad = function (this: PageInstance & MpInstance, query) {
        const identity = prerendered ?? createPageIdentity(routePath, query)
        prerendered = undefined

        originalOnLoad.call(this, query, (dispatch: () => void) => {
            mountPage.call(this, component, vptPageOptions, identity, dispatch)
        })
    }

    return config
}
