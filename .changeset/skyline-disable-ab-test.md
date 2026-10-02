---
'create-vite-taro': patch
---

默认模板的 Skyline 配置新增 `disableABTest: true`，避免真机因未配置 We 分析 AB 实验而继续使用 WebView。同步更新 Skyline 示例和文档，保留开发者工具原有的热更新调试设置。

已有项目需在 `vite.config.ts` 的 `appJson.rendererOptions.skyline` 中手动添加 `disableABTest: true`；升级依赖不会改写应用配置。需要 AB 灰度的应用可将 `disableABTest` 设为 `false` 并配置实验。
