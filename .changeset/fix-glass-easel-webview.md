---
'create-vite-taro': patch
---

修正默认模板中 glass-easel 的 WebView 配置位置：将 `glassEaselWebview: true` 从 `appJson` 顶层移到 `appJson.window`，确保 WebView 及 Skyline 回退实际启用 glass-easel 运行时。

已有项目请同步调整此配置，并使用微信基础库 3.8.12 或更高版本。页面级设置仍直接写在 `page.config.glassEaselWebview` 中。
