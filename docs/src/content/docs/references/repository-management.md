---
title: 仓库维护
description: VPT monorepo 的安装、构建、验证与发布流程。
---

本页面向仓库贡献者，因此命令统一使用 pnpm。应用开发者请从[快速开始](/guides/quick-start/)进入。

## 环境准备

仓库要求 Node.js 26+ 和 pnpm 11：

```sh
git clone https://github.com/sep2/vite-plugin-taro.git
cd vite-plugin-taro
pnpm install
pnpm prepare:taro
pnpm build:plugin
```

`pnpm prepare:taro` 会从上游 npm 包和 `patches` 中重新生成项目维护的 Taro 支持包。首次检出、更新 Taro 版本或修改 patch 后应重新执行。

## 工作区结构

| 路径 | 用途 |
| --- | --- |
| `packages/vite-plugin-taro` | 发布到 npm 的 Vite 插件 |
| `packages/create-vite-taro` | 项目生成器及默认模板 |
| `packages/taro-react` | 生成的 React 19 兼容 Taro React 包 |
| `packages/taro-plugin-framework-react` | 生成的 React 19 与 WX App 包裹框架插件 |
| `packages/taro-runtime` | 生成的 WX App 包裹 Taro Runtime 包 |
| `packages/loan-genius` | WX 与 H5 综合示例 |
| `packages/native-comp-demo` | 微信原生组件示例 |
| `packages/hmr-stress-demo` | 深层 React 树与页面栈 HMR 压力测试项目 |
| `packages/towxml-stream-demo` | Towxml 原生组件与流式渲染示例 |
| `docs` | Astro Starlight 文档站 |

## 构建与验证

### 插件

```sh
pnpm build:plugin
pnpm typecheck
pnpm test
```

`pnpm typecheck` 会运行所有工作区中声明的类型检查。需要只检查插件时，运行 `pnpm typecheck:plugin`。

### 示例应用

```sh
pnpm typecheck:loan-genius
pnpm build:loan-genius:wx
pnpm build:loan-genius:h5

pnpm typecheck:native-comp-demo
pnpm build:native-comp-demo:wx

pnpm typecheck:hmr-stress-demo
pnpm build:hmr-stress-demo:wx

pnpm typecheck:towxml-stream-demo
pnpm build:towxml-stream-demo:wx
```

### 代码与文档

```sh
pnpm lint
pnpm format
pnpm dev:docs
pnpm --filter docs build
```

`pnpm format` 会执行 Biome 的安全写入。TypeScript 检查使用 `tsc`。

## 开发服务器

```sh
pnpm dev:loan-genius:wx
pnpm dev:loan-genius:h5
pnpm dev:native-comp-demo:wx
pnpm dev:hmr-stress-demo:wx
pnpm dev:towxml-stream-demo:wx
```

运行微信目标后，在微信开发者工具中打开对应项目的 `dist/wx`。HMR 压力项目启动后，可运行 `pnpm stress:hmr-stress-demo` 发送 30 次定时编辑，或运行 `pnpm stress:hmr-stress-demo:burst` 发送 60 次快速编辑。运行 H5 目标后，使用 Vite 输出的本地地址。

## 生成文件

- 不要手动编辑 `packages/vite-plugin-taro/dist`；运行 `pnpm build:plugin` 重新生成。
- 不要直接修改 `packages/taro-react`、`packages/taro-plugin-framework-react` 或 `packages/taro-runtime` 的实现；修改对应的 `patches/*@4.2.1*.patch` 后运行 `pnpm prepare:taro`。
- 不要手动编辑 `CHANGELOG.md`；运行 `pnpm changelog`，或在发布时由 release 命令生成。
- 根目录的 `README.md` 与 `README.en.md` 是插件 README 的来源；`pnpm build:plugin` 会同步到 `packages/vite-plugin-taro`。

## 发布

先验证待发布包：

```sh
pnpm publish:dry
```

更新全部包的版本：

```sh
pnpm version:bump patch
pnpm version:bump 1.0.0
```

完整发布流程会更新版本与 changelog、验证包、创建 commit 和 tag，并默认推送：

```sh
pnpm release patch
pnpm release 1.0.0
```

发布 beta 版本：

```sh
pnpm release beta
```

该命令从稳定版本创建下一个 patch 的 `beta.0`，再次运行则递增为 `beta.1`。发布工作流会将预发布标识符用作 npm dist-tag，因此 beta 版本发布到 `beta`，不会移动 `latest`。测试完成后，运行 `pnpm release patch` 会移除预发布标识符并发布同一基础版本的稳定版本。

常用选项：

```sh
pnpm release patch --dry-run
pnpm release patch --no-push
```

推送 `v*.*.*` tag 后，`.github/workflows/publish.yml` 会通过 npm Trusted Publishing 按依赖顺序发布公开包，并在稳定版本发布成功后部署文档；beta 发布不会重复部署。文档首页在静态构建阶段显示稳定版本：普通文档构建读取 npm 的 `latest` dist-tag，稳定发布完成后的部署直接使用已发布的 Git tag，避免 npm CDN 缓存造成版本回退，且不依赖浏览器 JavaScript。不要为该工作流配置 `NPM_TOKEN`。
