---
'create-vite-taro': patch
---

修正默认模板中 glass-easel 的 WebView 配置位置：将 `glassEaselWebview: true` 从 `appJson.window` 移到 `appJson` 顶层，与 `componentFramework` 并列，确保 WebView 及 Skyline 回退实际启用 glass-easel 运行时。

默认模板和所有演示应用的 WX 配置同时为每个页面设置 `config.glassEaselWebview: true`，避免开发者工具 WebView 模拟器忽略全局开关（已在基础库 3.17.2 验证）。支付宝、抖音和 H5 配置保持不变。

已有项目请同步调整顶层配置，并在各微信页面的 `config` 中设置 `glassEaselWebview: true`；使用微信基础库 3.8.12 或更高版本。此开关不要求开启页面预渲染。
