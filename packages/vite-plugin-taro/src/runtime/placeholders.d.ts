import type { Route, SpaRouterConfig } from '@tarojs/router/types/router'

declare global {
    const __VPT_H5_APP_CONFIG__: SpaRouterConfig
    const __VPT_H5_ROUTES__: Route[]
    const __VPT_APP_CONFIG__: Record<string, unknown>
    const __VPT_PAGE_PATH__: string
    const __VPT_PAGE_CONFIG__: Record<string, unknown>
    const __VPT_TRANSPORT__: (moduleId: string) => System.Registration | PromiseLike<System.Registration>
}
