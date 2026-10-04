import { createPageConfig as createTaroPageConfig, type MiniElementData } from 'vite-plugin-taro-runtime/runtime/mini'

type PageData = {
    app: { nn: string; cn: MiniElementData['cn'] }
    page: { cn: MiniElementData['cn'] }
}

/** Keeps the public Taro config and its object-valued data while carrying private prerender inputs. */
export function createPageConfig(
    component: Parameters<typeof createTaroPageConfig>[0],
    route: string,
    data: PageData,
    pageConfig: Parameters<typeof createTaroPageConfig>[3]
) {
    const taroPageConfig = createTaroPageConfig(component, route, data, pageConfig)

    const config = Object.assign(taroPageConfig, {
        data,
        __vpt_meta: {
            component,
            route,
            // Page HMR skips prerendering during native re-registration and clears this flag onShow.
            skipPrerender: false
        }
    })

    // Keep both slots out of native methods. Taro onLoad consumes the prepared identity without deleting the writable slot.
    Object.defineProperties(config, {
        __vpt_meta: { enumerable: false },
        $taroInitialPage: { value: undefined, writable: true }
    })

    return config
}
