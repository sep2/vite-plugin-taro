---
'create-vite-taro': patch
---

### 变更

- 2c7a0dd3：新项目的 Skyline 配置默认设置 `disableABTest: true`，让符合条件的真机无需配置 We 分析 AB 实验即可使用 Skyline。
- e3d52ef2：新项目的微信页面显式设置 `config.glassEaselWebview: true`，并保留 App 顶层开关，避免开发者工具 WebView 模拟器忽略全局设置而未启用 glass-easel；其他目标配置不变。

### 升级说明

从 `0.7.11` 升级到 `0.7.12-beta.0`：新项目使用 `pnpm create vite-taro@0.7.12-beta.0 my-app`。
