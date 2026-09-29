---
'vite-plugin-taro': patch
---

### 变更

- 1d3a0f4c: Vite 依赖要求更新为 `8.3.1`，Rolldown 更新为 `1.2.11`；升级时需同步项目的构建依赖版本。

### 修复

- f4c37fd4: 修复小程序开发服务快速重启后，开发者工具不再响应后续热更新的问题；新构建写入前不再提前删除现有产物，启动失败时保留旧文件（#33）。
- b7ffb919: 小程序开发构建的进度日志遵循 Vite 的 `logLevel`，在 `silent`、`warn` 或 `error` 级别下不再输出转换模块、渲染分块等进度信息。

### 升级说明

从 `0.7.10-beta.0` 升级到 `0.7.10-beta.1`：运行 `pnpm add -D --save-exact vite-plugin-taro@0.7.10-beta.1 vite@8.3.1 rolldown@1.2.11`。

Vite 与插件需要使用同一版本的 Rolldown。pnpm 项目在 `pnpm-workspace.yaml` 的 `overrides` 中设置 `rolldown: 1.2.11`；npm / Bun 项目在 `package.json` 的 `overrides` 中设置 `"rolldown": "1.2.11"`；Yarn 项目在 `package.json` 的 `resolutions` 中设置 `"rolldown": "1.2.11"`。合并已有配置，若已固定 Vite 版本，也需将对应覆盖项同步更新为 `8.3.1`。
