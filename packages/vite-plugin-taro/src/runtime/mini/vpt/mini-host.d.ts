import type { createReactApp } from 'vite-plugin-taro-runtime/plugin-framework-react/runtime'
import type { RendererHost } from 'vite-plugin-taro-runtime/react'
import type { TaroElement, TaroText } from 'vite-plugin-taro-runtime/runtime/mini'

/** VPT 的 App 绑定与共享 React renderer 使用同一个选定 host。 */
export type MiniHost = RendererHost<TaroElement, object, TaroElement, TaroText> &
    Readonly<{
        /** App 容器同步创建后、首次 React 提交前调用一次；App 与 Page 的挂载仍由 Taro 管理。 */
        bindApp(app: ReturnType<typeof createReactApp>, container: TaroElement): void
    }>
