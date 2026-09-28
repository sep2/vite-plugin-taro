---
"create-vite-taro": patch
---

### 变更

- 3f8e2da2: 新项目的开发、构建和预览脚本不再强制设置 `NODE_ENV`，由 Vite 选择默认值，并保留外部传入的设置。

### 升级说明

从 `0.7.9` 升级到 `0.7.10-beta.0`：新项目使用 `pnpm create vite-taro@0.7.10-beta.0 my-app`。
