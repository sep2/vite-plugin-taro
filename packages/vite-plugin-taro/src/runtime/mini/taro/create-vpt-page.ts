import { createPageConfig as createTaroPageConfig, type MiniElementData } from 'vite-plugin-taro-runtime/runtime/mini'
import { prerenderToData } from './prerender-to-data.ts'

export type PageData = {
    app: { nn: string; cn: MiniElementData['cn'] }
    page: { cn: MiniElementData['cn'] }
}

export type VptPageOptions = { path: string; config: Record<string, unknown>; prerender: boolean }

/** Prepares the original Taro config for native registration, capturing the seed when prerendering. */
export function createVptPage(
    component: Parameters<typeof createTaroPageConfig>[0],
    vptPageOptions: { path: string; config: Record<string, unknown>; prerender: boolean }
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

    const config = Object.assign(taroPageConfig, { __vpt_meta: {} })

    // Keep the one-shot prerender identity out of native registration.
    Object.defineProperty(config, '__vpt_meta', { enumerable: false })

    if (prerender) {
        // Keep render inputs in the closure; native onLoad only needs the prepared identity.
        config.data = () => prerenderToData(config, component, routePath, initialData)
    }

    return config
}
