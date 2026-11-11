---
"vite-plugin-taro": patch
"create-vite-taro": patch
---

VPT 内部复用 Vite 加载的 Rolldown 实例，统一原生插件、MagicString、开发引擎和配套 HMR 运行时的来源。生成模板由应用直接管理 Vite 和 VPT，Rolldown 通过工具链依赖安装。

升级已有项目时，先删除 `overrides` 或 `resolutions` 中的 Rolldown 条目，再执行 `pnpm remove -D rolldown` 移除仅为 VPT 添加的直接依赖，重新安装依赖并重启开发服务器。项目自身调用 Rolldown API 时可继续保留直接依赖，VPT 使用 Vite 所属的编译器实例。
