---
'vite-plugin-taro': patch
---

- 765a019: 新增 `polyfills` 选项，按需补充小程序缺失的 JavaScript / Web API；`URL` 和 `URLSearchParams` 不再由插件自动注入。
- 8a78bd0: 默认压缩小程序生产构建的全局样式，减小样式产物体积。
- 6a7536e: 修复支付宝小程序开发编译因动态导入而报错的问题。
- 79c51ac: 小程序生产构建不再将 `performance.now()` 替换为 `Date.now()`。

### 升级说明

从 `0.7.3` 升级到 `0.7.4`：运行 `pnpm add -D vite-plugin-taro@0.7.4`，然后重启开发服务。

- **使用 `URL` / `URLSearchParams` 的小程序（包括依赖中的用法）**：旧版的自动注入已移除。运行环境缺失这些 API 时，在 `vpt()` 选项中添加 `polyfills: ['web.url']`；仅需 `URLSearchParams` 时可选 `['web.url-search-params']`。无需另行安装 core-js。可通过 `globalThis.URL` / `globalThis.URLSearchParams` 访问这些 API；微信代码若继续使用裸 `URL`，还需在 **Vite 顶层配置**添加 `define: { URL: 'globalThis.URL' }`。H5 不受此变更影响。
- **生产代码使用 `performance.now()` 的小程序**：确认运行环境提供该 API。若需保留旧版的替换行为，在 **Vite 顶层配置**添加 `define: { 'performance.now': 'Date.now' }`，并合并已有的 `define` 配置。
