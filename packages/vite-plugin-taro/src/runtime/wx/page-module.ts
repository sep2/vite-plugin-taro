import './app-module.ts'

// @ts-expect-error: The WX build replaces this private import with the configured Page component.
import PageComponent from '\0vpt:page-component'
import { createPageConfig } from './taro-runtime.ts'

declare const __VITE_PLUGIN_TARO_PAGE_PATH__: string
declare const __VITE_PLUGIN_TARO_PAGE_CONFIG__: Record<string, unknown>

export default createPageConfig(
    PageComponent,
    __VITE_PLUGIN_TARO_PAGE_PATH__,
    undefined,
    __VITE_PLUGIN_TARO_PAGE_CONFIG__
)
