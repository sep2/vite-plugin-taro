---
'create-vite-taro': patch
---

通过 pnpm 创建项目时，新增 `pnpm-workspace.yaml`，显式跳过 `core-js` 仅输出捐赠提示的安装脚本，避免安装依赖时要求运行 `pnpm approve-builds`，同时保留其他依赖的构建脚本审批。通过 npm、Yarn 或 Bun 创建的项目不包含该 pnpm 专用配置。

升级方式：使用 pnpm 10.26+ 运行新版 `create-vite-taro` 创建项目。已有项目或之后切换到 pnpm 的项目，可在根目录创建或更新 `pnpm-workspace.yaml`，在 `allowBuilds` 中添加 `core-js: false`，无需批准或运行该脚本。
