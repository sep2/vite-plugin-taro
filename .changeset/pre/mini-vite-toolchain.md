---
'vite-plugin-taro': patch
---

### 变更

- 4b22bb4f：Vite 依赖要求更新为 `8.3.4`，Rolldown 更新为 `1.2.13`，并适配新版 Vite 的小程序样式热更新；升级时需同步项目的构建依赖版本。

### 修复

- 4b22bb4f：修复小程序 JavaScript 产物以行注释结尾时生成无效代码、导致模块无法加载的问题。

### 升级说明

从 `0.7.12-beta.0` 升级到 `0.7.12-beta.1`：运行 `pnpm add -D --save-exact vite-plugin-taro@0.7.12-beta.1 vite@8.3.4 rolldown@1.2.13`。

Vite 与插件需要使用同一版本的 Rolldown。pnpm 项目在 `pnpm-workspace.yaml` 的 `overrides` 中设置 `rolldown: 1.2.13`；npm / Bun 项目在 `package.json` 的 `overrides` 中设置 `"rolldown": "1.2.13"`；Yarn 项目在 `package.json` 的 `resolutions` 中设置 `"rolldown": "1.2.13"`。已使用 `$rolldown` 引用直接依赖的覆盖项会随依赖升级。合并已有配置，若已固定 Vite 版本，也需将对应覆盖项同步更新为 `8.3.4`。
