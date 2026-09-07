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

`pnpm install` 会把 `patches` 应用到固定版本的 Taro 开发依赖，`pnpm prepare:taro` 再从这些本地依赖构建统一运行时适配包。首次检出、更新 Taro 版本或修改 patch 后应依次重新执行这两个命令。

## 工作区结构

| 路径 | 用途 |
| --- | --- |
| `packages/vite-plugin-taro` | 发布到 npm 的 Vite 插件 |
| `packages/create-vite-taro` | 项目生成器及默认模板 |
| `packages/taro-runtime` | 从固定版本 Taro 开发依赖构建的统一运行时、React 与平台适配包 |
| `packages/loan-genius` | 微信、支付宝与 Web 综合示例 |
| `packages/native-comp-demo` | 微信与支付宝原生组件示例 |
| `packages/hmr-stress-demo` | 微信与支付宝深层 React 树及页面栈 HMR 压力测试项目 |
| `packages/towxml-stream-demo` | 微信 Towxml 原生组件与流式渲染示例 |
| `docs` | Astro Starlight 文档站 |

## 构建与验证

### 插件

```sh
pnpm build:plugin
pnpm typecheck
pnpm test
```

`pnpm typecheck` 会检查仓库脚本并运行所有工作区中声明的类型检查。`pnpm test` 包含发布流程与包产物测试，因此需要先准备运行时并构建插件。需要只检查插件时，运行 `pnpm typecheck:plugin`。

### 示例应用

```sh
pnpm typecheck:loan-genius
pnpm build:loan-genius:wx
pnpm build:loan-genius:zfb
pnpm build:loan-genius:h5

pnpm typecheck:native-comp-demo
pnpm build:native-comp-demo:wx
pnpm build:native-comp-demo:zfb

pnpm typecheck:hmr-stress-demo
pnpm build:hmr-stress-demo:wx
pnpm build:hmr-stress-demo:zfb

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
pnpm dev:loan-genius:zfb
pnpm dev:loan-genius:h5
pnpm dev:native-comp-demo:wx
pnpm dev:native-comp-demo:zfb
pnpm dev:hmr-stress-demo:wx
pnpm dev:hmr-stress-demo:zfb
pnpm dev:towxml-stream-demo:wx
```

运行微信目标后，在微信开发者工具中打开对应项目的 `dist/wx`；运行支付宝目标后，在支付宝小程序开发者工具中打开 `dist/zfb`。HMR 压力项目的自动编辑与断言工具当前仅连接微信开发者工具，应通过仓库根目录的 `pnpm stress:hmr-stress-demo:burst` 运行。运行 H5 目标后，使用 Vite 输出的本地地址。

## 生成文件

- 不要手动编辑 `packages/vite-plugin-taro/dist`；运行 `pnpm build:plugin` 重新生成。
- 根目录 `CHANGELOG.md` 保留迁移前的发布历史；后续日志由 Changesets 生成到三个发布包各自的 `CHANGELOG.md`。
- 根目录的 `README.md` 与 `README.en.md` 是插件 README 的来源；`pnpm build:plugin` 会同步到 `packages/vite-plugin-taro`。

## 发布

发布流程为 **本地准备版本，推送 `main` 后由 CI 发布**。不在本地执行 npm 发布，也不自动创建 release PR。

### 记录改动与准备版本

```sh
pnpm changeset
pnpm changeset status
pnpm release
```

`pnpm changeset` 记录面向用户的改动说明与 patch / minor / major 级别，可以随功能提交一起提交。`pnpm changeset status` 预览累计版本计划。`pnpm release` 是一个不接受 bump 参数的准备命令：执行 `changeset version`、更新 `pnpm-lock.yaml`，并格式化 `.changeset`。它不会提交、创建 tag、推送或发布。

`.changeset/config.json` 将 `vite-plugin-taro`、`vite-plugin-taro-runtime` 和 `create-vite-taro` 放在同一个 `fixed` 组中，始终一起更新版本。根工作区、文档和示例应用均为私有包，不参与版本发布。生成器创建项目时从自身版本推导插件依赖，不再单独同步模板中的版本号。

检查生成的 `.changeset` 变更、包内 `package.json` / `CHANGELOG.md` 和 `pnpm-lock.yaml`，提交这些文件，然后推送：

```sh
git push origin main
```

仅有未消费 changeset 的 push 不发布，等待本地执行 `pnpm release`。没有待消费 changeset 且存在 npm 尚未发布的版本时，CI 自动发布；全部版本已发布时跳过。因此 **推送准备好的版本即授权发布**，不再需要额外的 `v*.*.*` tag。准备版本后不要夹入尚未包含在发布说明中的功能改动。

### Beta 与稳定版本

本次迁移保留了 `0.7.1-beta.1`，并进入 Changesets 3 的 beta 模式。下一个 patch changeset 会准备 `0.7.1-beta.2`，不会重置为 `beta.0`。当前状态保存在 `.changeset/pre.json` 中，不要重复进入预发布模式。

从稳定版本开始下一轮 beta 时，只运行一次：

```sh
pnpm changeset pre enter beta
```

之后照常记录 changeset、运行 `pnpm release`、提交并推送。Beta 发布到 npm 的 `beta` dist-tag，不移动 `latest`。已消费的 beta changeset 保存在 `.changeset/pre`，供最终稳定版汇总发布说明。

准备转为稳定版本时：

```sh
pnpm changeset pre exit
pnpm release
```

检查、提交并推送后，CI 将不带 beta 后缀的版本发布到 `latest`。预发布模式作用于整个发布组；退出模式本身不会发布，必须应用版本并推送。

### 验证与 CI

可以在本地运行与发布相关的检查，整个过程不会向 npm 发布：

```sh
pnpm prepare:taro
pnpm build:plugin
pnpm typecheck
pnpm test:release
```

测试覆盖固定版本组、连续 beta 与转稳定版、私有包排除、真实 Changesets / pnpm 打包后的入口和运行时依赖，以及生成器的稳定版与 beta 依赖版本。

`.github/workflows/publish.yml` 先运行现有的覆盖率和 Windows 验证，再进入一个发布 job：安装依赖、通过 Changesets 检查待消费 changeset 与 npm 未发布版本，仅在准备好发布时构建、检查类型，并调用 `changesets/action/publish@v2` 发布。没有独立的打包 job、跨 job 的发布产物传输或自动版本 PR。每次 `main` push 都先通过质量检查，包括补发先前未成功发布的版本。

发布使用 pnpm，保留 `workspace:*` 依赖转换与 `publishConfig` 入口覆盖，并通过 npm Trusted Publishing / OIDC 认证。保留 `publish.yml` 文件名以匹配现有 npm Trusted Publisher 配置；不要配置 `NPM_TOKEN`。发布 job 同时负责构建和发布，拥有仓库写入与 OIDC 权限；文档部署 job 的 OIDC 权限仅用于 GitHub Pages。

成功发布后，CI 创建各包的 tag（例如 `vite-plugin-taro@0.7.1`）和 GitHub Release，正文来自相应包的 changelog；beta Release 标记为预发布。旧 `v*.*.*` tag 与根 changelog 作为历史保留，不再生成。

稳定版本发布成功后始终重新部署文档，beta 版本只在本次 push 包含文档改动时部署。普通文档构建读取 npm 的 `latest` dist-tag；稳定发布后的部署直接传入已发布的插件版本 `VPT_RELEASE_VERSION`，避免 npm CDN 缓存导致页面显示旧版本。
