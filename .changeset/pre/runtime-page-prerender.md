---
'vite-plugin-taro-runtime': patch
---

### 新增

- 21a496b2、978a8ead：支持预渲染页面在原生 `onLoad` 中复用已准备的路由身份，避免重复挂载 React 页面，保留首次渲染的状态、节点和事件绑定。

### 升级说明

从 `0.7.11` 升级到 `0.7.12-beta.0`：运行时随 `vite-plugin-taro@0.7.12-beta.0` 自动升级，无需单独安装。
