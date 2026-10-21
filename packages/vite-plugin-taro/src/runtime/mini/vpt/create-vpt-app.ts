import host from '\0vpt:renderer-host'
import React from 'react'
import { createReactApp } from 'vite-plugin-taro-runtime/plugin-framework-react/runtime'
import ReactDOM from 'vite-plugin-taro-runtime/react'
import { document } from 'vite-plugin-taro-runtime/runtime/mini'

/** 创建唯一的 Taro/React App，并由选中的 host 绑定其呈现行为。 */
export function createVptApp(
    App: Parameters<typeof createReactApp>[0],
    appConfig: Parameters<typeof createReactApp>[3]
) {
    const app = createReactApp(App, React, ReactDOM, appConfig)
    /*
     * Taro 同步取得或创建 App 容器，React 挂载沿用并发调度。
     * 使用与 Taro 相同的 appId 取得这个确切容器，在首次 React 提交前完成一次绑定。
     * App 的配置由其创建入口显式触发，不依赖随后创建的子节点或 outlet。
     */
    const container = document.getElementById(appConfig.appId || 'app')!

    host.bindApp(app, container)

    return app
}
