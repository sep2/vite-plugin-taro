---
"vite-plugin-taro": patch
---

- 765a019: 新增小程序 `polyfills` 选项，可按需选择 core-js 模块补充 JavaScript / Web API，无需额外安装或手动导入。
- 8a78bd0: 小程序生产构建使用 Lightning CSS 压缩全局样式，减小样式产物体积。
- 6a7536e: 修复小程序原生代码块中的动态导入导致支付宝开发编译失败的问题。
- 79c51ac、65cecb6: 将 `performance.now` 兼容处理限定在开发服务中，并在非生产环境自动补充 `queueMicrotask`，避免影响生产环境原生 API。

### 升级说明

从 `0.7.3` 升级到 `0.7.4-beta.0`：运行 `pnpm add -D vite-plugin-taro@0.7.4-beta.0`，无需修改现有代码或配置。需要补充 URL API 时，在插件选项中添加 `polyfills: ['web.url']`；微信代码直接使用 `URL` 名称时，还需在 Vite 顶层配置添加 `define: { URL: 'globalThis.URL' }`。本版本为 beta，建议先在测试项目验证。
