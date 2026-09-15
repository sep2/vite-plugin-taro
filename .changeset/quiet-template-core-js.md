---
'create-vite-taro': patch
---

509b0da: 新建 pnpm 项目不再为 `core-js` 的捐赠提示脚本要求运行 `pnpm approve-builds`，其他依赖的构建脚本审批不变。

### 升级说明

从 `0.7.3` 升级到 `0.7.4`：新建项目请使用 pnpm 10.26+ 运行 `pnpm create vite-taro@0.7.4 my-app`。已有项目无需重新生成；更新插件时请参阅 `vite-plugin-taro` 的升级说明。
