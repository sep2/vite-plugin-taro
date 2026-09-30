---
'vite-plugin-taro': patch
'create-vite-taro': patch
---

将 Rolldown 升级至 `1.2.12`，同步项目模板和示例的版本要求。包含上游 macOS 文件监听修复：模块图未变化时不再无谓地重启文件监听器，避免热更新构建间隙的保存事件丢失、输出停留在旧版本直到再次保存。

现有项目升级时需将 Rolldown 直接依赖及版本覆盖统一更新为 `1.2.12`，确保 Vite 与 VPT 使用同一版本。运行 `pnpm add -D --save-exact rolldown@1.2.12`，并将 `pnpm-workspace.yaml` 中的 `overrides.rolldown` 更新为 `1.2.12`。npm / Bun 项目同步更新 `package.json` 的直接依赖及 `overrides`，Yarn 项目同步更新直接依赖及 `resolutions`；已使用 `$rolldown` 引用直接依赖的覆盖项无需修改。Vite 版本要求仍为 `8.3.1`。
