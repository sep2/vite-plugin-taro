---
'vite-plugin-taro': patch
---

### 新增

- b3a63768、cb867c93：新增 `pages[].prerender?: boolean`，默认关闭。开启后，微信 glass-easel 页面在原生数据工厂中同步生成 App/Page 初始视图，便于 Skyline `ShareElement` 在首帧找到目标节点；后续 `onLoad` 保留同一 React 实例、状态与事件。App 尚未就绪时保留原有异步初始化。
- 9c1ab314：小程序热更新支持 `import.meta.hot.dispose()`，在模块替换前执行资源清理，避免原生监听器重复注册。

预渲染要求宿主支持原生 Page 数据工厂：微信使用 glass-easel，路由监听要求基础库 3.5.5+，WebView 模式要求 3.8.12+。首次 React effects 可能早于原生 `onLoad`，依赖原生页面实例的操作应放在 `useLoad` / `useReady` 中。配置方式见[页面配置](https://vpt.js.org/guides/configuration/)与 [Skyline 指南](https://vpt.js.org/guides/skyline-mode/)。

### 修复

- 93667c4e：修复微信 glass-easel 页面热更新后，后续真实页面生命周期可能被错误跳过的问题；热更新保留原生页面实例和数据工厂，不重放生命周期。

### 升级说明

从 `0.7.11` 升级到 `0.7.12-beta.0`：运行 `pnpm add -D --save-exact vite-plugin-taro@0.7.12-beta.0`。
