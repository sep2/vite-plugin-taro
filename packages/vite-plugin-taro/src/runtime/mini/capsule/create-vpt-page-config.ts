import { createPageConfig as createTaroPageConfig, type MiniElementData } from 'vite-plugin-taro-runtime/runtime/mini'
import type { VptPageOption } from '../../../options.ts'
import { prerenderToData } from './prerender-to-data.ts'

export type PageData = {
    app: { nn: string; cn: MiniElementData['cn'] }
    page: { cn: MiniElementData['cn'] }
}

/** Native config with private prerender inputs and either a seed or a data factory. */
export type PrerenderPageConfig = Omit<ReturnType<typeof createTaroPageConfig>, 'data'> & {
    data: PageData | (() => PageData)
    __vpt_meta: {
        component: Parameters<typeof createTaroPageConfig>[0]
        route: string
        skipPrerender: boolean
    }
}

/** Prepares the original Taro config for native registration, capturing the seed when prerendering. */
export function createVptPageConfig(
    component: Parameters<typeof createTaroPageConfig>[0],
    vptPageOptions: VptPageOption
) {
    const { path: routePath, config: pageConfig, prerender } = vptPageOptions
    /*
     * Generated Page templates invoke Taro's unchanged recursive component, whose input is one compact node selected by i.nn.
     * App JSX does not have that cardinality: it may return one or many top-level hosts, and the private Page outlet may occur at
     * any depth within them. vpt_fragment is therefore a native-template-only collection adapter. Its fixed nn selects a transparent
     * template that iterates cn while one surrounding component owns the Page-content boundary. Runtime projection markers relay
     * that content only through the App branch containing the outlet. Without the fragment, each App root would need a separate
     * recursive component and potential Page-content copy, or the component would need an App-specific collection mode.
     *
     * This record is not a Taro host: it has no Fiber, event source, ref, lifecycle, native element, or keyed parent collection.
     * It consequently needs no sid. Only cn is seeded and updated; nn remains the stable generic-template discriminator.
     */
    const initialData: PageData = { app: { nn: 'vpt_fragment', cn: [] }, page: { cn: [] } }

    const taroPageConfig = createTaroPageConfig(component, routePath, initialData, pageConfig)

    const config: PrerenderPageConfig = Object.assign(taroPageConfig, {
        data: initialData,
        __vpt_meta: {
            component,
            route: routePath,
            // Page HMR skips prerendering during native re-registration and clears this flag onShow.
            skipPrerender: false
        }
    })

    // Keep private inputs and the one-shot prerender identity out of native methods.
    Object.defineProperty(config, '__vpt_meta', { enumerable: false })

    if (prerender) {
        // Replace only the data field; the closure retains the seed for skipped or uncommitted renders.
        config.data = () => prerenderToData(config, initialData)
    }

    return config
}
