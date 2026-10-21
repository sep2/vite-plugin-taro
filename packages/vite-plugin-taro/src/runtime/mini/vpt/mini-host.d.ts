import type { createReactApp } from 'vite-plugin-taro-runtime/plugin-framework-react/runtime'
import type { RendererHost } from 'vite-plugin-taro-runtime/react'
import type { createPageConfig, PageInstance, TaroElement, TaroText } from 'vite-plugin-taro-runtime/runtime/mini'
import type { MiniComponentPage } from './mini-component-page.d.ts'
import type { VptPageOptions } from './vpt-page-options.d.ts'

/** VPT 的 App 绑定与共享 React renderer 使用同一个选定 host。 */
export type MiniHost = RendererHost<TaroElement, object, TaroElement, TaroText> &
    Readonly<{
        /** Bind the App container before its first React commit; VPT coordinates Page mounting. */
        bindApp(app: ReturnType<typeof createReactApp>, container: TaroElement): void
        /** Create the native configuration; the Page shell selects registration from its shape. */
        createPage(
            component: Parameters<typeof createPageConfig>[0],
            options: VptPageOptions
        ): PageInstance | MiniComponentPage
    }>
