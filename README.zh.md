# vite-plugin-taro

[![npm version](https://img.shields.io/npm/v/vite-plugin-taro.svg)](https://www.npmjs.com/package/vite-plugin-taro)
![Vite compatibility](https://registry.vite.dev/api/badges?package=vite-plugin-taro&tool=vite)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

简体中文 | [English](README.md)

使用最新标准化前端技术栈 Vite 8、React 19、Taro 4 和 Tailwind CSS v4 构建微信小程序与 Web 应用。

`vite-plugin-taro` 面向希望用 Vite 构建 Taro React 应用的团队：保留 Taro 跨平台组件和 API，告别 Taro webpack，并修复/规避官方 Taro Vite 的常见坑。一个插件即可构建微信小程序与 Web。

在线演示：<https://sep2.github.io/vite-plugin-taro>。如何在本地运行，请参见[示例应用](https://github.com/sep2/vite-plugin-taro/tree/main/packages/loan-genius/README.zh.md)。

- **Vite + React 19** 基于 Vite 8 生态，一份代码覆盖微信小程序与 Web。
- **Taro 能力，无需 webpack** 使用 Taro 组件和 API，摆脱旧式 webpack 链路。
- **Tailwind CSS v4 开箱即用** 直接书写工具类，微信与 Web 样式自动适配。
- **Skyline 就绪** 支持微信 Skyline 渲染模式。
- **热更新** 依托于 Vite 标准的热更新支持，Web 与小程序开发都能快速查看改动。
- **条件编译** 用 Taro 风格 `#ifdef` / `#ifndef` / `#if` 拆分代码和样式。
- **工作区友好** 支持普通项目与 monorepo，兼容 `npm`、`pnpm`、`Yarn`、`Bun`。
- **TypeScript 友好** 从配置到应用代码都有类型支持。

## 快速开始

新应用推荐使用 `create-vite-taro`。它会生成 Vite 8 + React 19 + Tailwind CSS v4 + Taro 4 项目。

### 1. 创建并安装

```sh
# 使用默认模板创建新应用
npm create vite-taro@latest my-app

# 或使用 pnpm 创建
pnpm --config.minimum-release-age=0 create vite-taro@latest my-app

# 进入项目并安装依赖
cd my-app
npm install
```

### 2. 配置微信小程序 App Id

模板会创建 `.env.local`。请将 `VITE_PLUGIN_TARO_WECHAT_APP_ID` 设置为你的微信小程序 App Id。

### 3. 开发模式运行

```sh
# 微信小程序：以 watch 模式重新构建 dist/wx
npm run dev:wx

# 然后在微信开发者工具中打开 dist/wx

# H5：启动 Vite 开发服务器
npm run dev:h5

# 然后在浏览器中打开标准 Vite 地址
# http://localhost:5173
```

你可以在两个终端中同时运行 `npm run dev:wx` 和 `npm run dev:h5`。

提示：受微信限制，开发者工具热重载有时不会完整生效。建议日常优先使用 Web 的 Vite 热更新快速调试，并定期在微信开发者工具中验证小程序端效果。

### 4. 构建、预览和类型检查

```sh
# 生产微信小程序产物
npm run build:wx

# 生产 H5 产物
npm run build:h5

# 预览构建后的 H5 应用
npm run preview:h5

# 使用 tsc 进行类型检查
npm run typecheck
```

### 5. 使用 Taro 虚拟模块

应用代码请使用这些导入：

```tsx
import Taro from 'virtual:taro/api'
import { Text, View } from 'virtual:taro/components'
```

| 导入 | 用途 |
| --- | --- |
| `virtual:taro/components` | Taro React 组件，例如 `View`、`Text`、`Button`、`Image` 和 `ScrollView`。 |
| `virtual:taro/api` | Taro API 和 hooks，例如 `Taro.navigateTo`、`Taro.getWindowInfo` 和 `Taro.useLaunch`。 |

用法与 Taro 本身一致；组件和 API 的具体用法请参考 [Taro 官网](https://docs.taro.zone)。

你不再需要安装 `@tarojs/*` 包；应用代码也不要从 `@tarojs/*` 导入。


## 手动接入已有应用

已有应用或自定义项目结构，可以按下面的步骤手动接入插件。先安装插件：

```sh
npm install -D vite-plugin-taro
```

你的应用还必须提供 Vite 8、React 19、React DOM 19、TypeScript 7，以及 Node/React 类型包。如果应用尚未安装它们，请安装缺失的包：

```sh
npm install react react-dom
npm install -D vite typescript@rc @types/node @types/react @types/react-dom cross-env
```

请从 `dependencies` 和 `devDependencies` 中移除所有 `@tarojs/*` 包。

下面的步骤会创建如下源码结构：

```text
my-app/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── app.css
    ├── app.ts
    └── pages/
        └── index/
            └── index.tsx
```

你也可以参考 [packages/loan-genius](https://github.com/sep2/vite-plugin-taro/tree/main/packages/loan-genius) 中的示例布局。

### 1. 添加 TypeScript 声明

将插件客户端类型添加到 `tsconfig.json`，让 TypeScript 识别虚拟模块：

```json
{
    "compilerOptions": {
        "jsx": "react-jsx",
        "moduleResolution": "bundler",
        "types": ["vite/client", "vite-plugin-taro/client"]
    },
    "include": ["src"]
}
```

### 2. 配置 Vite

创建 `vite.config.ts`，并从环境变量中选择插件目标：

```ts
import { defineConfig, loadEnv } from 'vite'
import vitePluginTaro, { type VitePluginTaroTarget } from 'vite-plugin-taro'

const targetEnvName = 'VITE_PLUGIN_TARO_TARGET'

function getTarget(env: Record<string, string>): VitePluginTaroTarget {
    const target = env[targetEnvName]
    if (target === 'wx' || target === 'h5') return target
    throw new Error(`${targetEnvName} must be "wx" or "h5".`)
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'VITE_PLUGIN_TARO_')
    const target = getTarget(env)

    return {
        build: {
            outDir: `dist/${target}`
        },
        plugins: [
            vitePluginTaro({
                target,
                app: 'src/app.ts',
                pages: [
                    {
                        path: 'pages/index/index',
                        config: {
                            navigationBarTitleText: 'Home'
                        }
                    }
                ],
                appJson: {
                    window: {
                        navigationBarTitleText: 'Demo',
                        navigationBarBackgroundColor: '#ffffff'
                    }
                },
                projectConfigJson: {
                    appid: env.VITE_PLUGIN_TARO_WECHAT_APP_ID || 'touristappid',
                    projectname: 'demo',
                    compileType: 'miniprogram'
                },
                sitemapJson: {
                    rules: [{ action: 'allow', page: '*' }]
                }
            })
        ]
    }
})
```

重要约定：

- 每次 Vite 运行时，`target` 必须是 `wx` 或 `h5`。
- `app` 是 React 根应用组件模块，应默认导出应用组件。
- 每个 `pages[].path` 都会映射到 `src/${path}.tsx` 文件。例如，`pages/index/index` 需要 `src/pages/index/index.tsx`。
- `appJson.pages` 会根据 `pages` 自动生成；你在 `appJson` 中传入的任何 `pages` 字段都会被覆盖。
- 示例配置启用了微信 Skyline。请根据自己的小程序调整 `appJson` 和 `projectConfigJson`。
- 插件不会读取 Taro CLI 配置文件，例如 `config/index.ts`、`app.config.ts` 或页面 `config.ts` 文件。请通过插件选项传入应用和页面配置。

### 3. 创建应用组件

`src/app.ts` 是共享应用包装组件。它会通过 `children` 接收当前页面。

```tsx
import Taro from 'virtual:taro/api'
import type { PropsWithChildren } from 'react'
import './app.css'

function App({ children }: PropsWithChildren) {
    Taro.useLaunch(() => {
        console.log('App launched')
    })

    return children
}

export default App
```

请在应用组件中导入全局样式。下一步会创建 `src/app.css`。

### 4. 创建全局样式

`src/app.css` 可以使用普通 CSS，也可以配合组件内 CSS Modules 和 Tailwind CSS v4。默认全局样式会为两个目标启用 Taro 组件样式和 Tailwind 工具类：

```css
@layer theme, base, taro, components, utilities;

/* Taro 组件样式。 */
@import "virtual:taro/css";
/* Tailwind CSS v4 样式和工具类。 */
@import "tailwindcss";

@source "./";
```

请保留 `@source "./";`，让 Tailwind 扫描源码目录。

### 5. 创建页面组件

`src/pages/index/index.tsx` 是 `pages/index/index` 对应的 React 页面组件。

```tsx
import Taro from 'virtual:taro/api'
import { Button, Text, View } from 'virtual:taro/components'

export default function IndexPage() {
    const windowInfo = Taro.getWindowInfo()

    return (
        <View className="p-4">
            <Text>Viewport width: {windowInfo.windowWidth}</Text>
            <Button
                onClick={() => {
                    Taro.showToast({ title: 'Hello from Taro' })
                }}
            >
                Show toast
            </Button>
        </View>
    )
}
```

### 6. 添加 H5 HTML 外壳

对于 H5，请保留一个普通的 Vite `index.html`，并包含 `#app` 挂载节点。插件会自动注入生成的 Taro H5 入口，因此你不需要普通 Vite 的 `src/main.tsx` 脚本。

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Taro Vite App</title>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>
```

### 7. 添加脚本

使用与 `create-vite-taro` 生成项目一致的脚本：

```json
{
    "scripts": {
        "dev:wx": "cross-env NODE_ENV=development VITE_PLUGIN_TARO_TARGET=wx vite build --watch",
        "dev:h5": "cross-env NODE_ENV=development VITE_PLUGIN_TARO_TARGET=h5 vite",
        "build:wx": "cross-env NODE_ENV=production VITE_PLUGIN_TARO_TARGET=wx vite build",
        "build:h5": "cross-env NODE_ENV=production VITE_PLUGIN_TARO_TARGET=h5 vite build",
        "preview:h5": "cross-env NODE_ENV=production VITE_PLUGIN_TARO_TARGET=h5 vite preview --outDir dist/h5",
        "typecheck": "tsc -b"
    }
}
```

### 8. 运行每个目标

```sh
npm run dev:wx       # 以 watch 模式重新构建 dist/wx
npm run dev:h5       # 启动 H5 开发服务器
npm run build:wx     # 构建 dist/wx
npm run build:h5     # 构建 dist/h5
npm run preview:h5   # 预览 dist/h5
npm run typecheck    # 使用 tsc 进行类型检查
```

在微信开发者工具中打开生成的 `dist/wx` 目录。

| 目标 | 含义 | 输出目录 |
| --- | --- | --- |
| `wx` | 开发/生产模式下的微信小程序。 | `dist/wx` |
| `h5` | H5 生产输出。 | `dist/h5` |

## 选项

```ts
type VitePluginTaroTarget = 'wx' | 'h5'

type VitePluginTaroPageOption = {
    path: string
    config: Record<string, unknown>
}

type VitePluginTaroOptions = {
    target: VitePluginTaroTarget
    app: string
    pages: VitePluginTaroPageOption[]
    appJson: Record<string, unknown>
    projectConfigJson: Record<string, unknown>
    sitemapJson: Record<string, unknown>
}
```

| 选项 | 描述 |
| --- | --- |
| `target` | 本次 Vite 调用的活动目标。微信小程序使用 `wx`，Web 使用 `h5`。 |
| `app` | 默认导出根 React 应用组件的源码文件，例如 `src/app.ts` 或 `src/app.tsx`。 |
| `pages` | 有序页面列表。该顺序会成为 `app.json.pages` 和 Web 路由顺序。 |
| `pages[].path` | 不带扩展名的 Taro 风格路由和输出路径，例如 `pages/index/index`。页面组件必须存在于 `src/${path}.tsx`。 |
| `pages[].config` | 合并到生成的微信页面 JSON 和 Web 路由配置中的页面配置。 |
| `appJson` | 两个目标共享的基础应用配置。插件会用 `options.pages` 覆盖其中的 `pages` 字段。 |
| `projectConfigJson` | `wx` 构建时输出的微信 `project.config.json` 内容。即使当前目标是 `h5`，选项类型也要求提供它。 |
| `sitemapJson` | `wx` 构建时输出的微信 `sitemap.json` 内容。即使当前目标是 `h5`，选项类型也要求提供它。 |

## 条件编译

插件会在 Vite 解析源码前移除未激活的 Taro 风格条件注释块。它适用于 `node_modules` 之外的 TypeScript、JavaScript、JSX/TSX、CSS、Sass、Less 和 Stylus 文件。

```ts
// #ifdef wx
console.log('WeChat only')
// #endif

// #ifdef h5
console.log('H5 only')
// #endif

// #if wx && !h5
console.log('WeChat expression')
// #elif h5
console.log('H5 expression')
// #else
console.log('fallback')
// #endif
```

支持的指令包括 `#ifdef`、`#ifndef`、`#if`、`#elif`、`#else` 和 `#endif`。条件使用插件目标标记 `wx` 和 `h5`；`#if` 表达式支持 `!`、`&&` 和 `||`。

## 按目标输出

### 微信小程序

对于 `target: 'wx'`，插件会配置 Vite，输出微信兼容的 CommonJS chunk 和小程序配套文件。

典型输出：

```text
dist/wx/
├── app.js
├── app.json
├── app.wxss
├── base.wxml
├── comp.js
├── comp.json
├── comp.wxml
├── project.config.json
├── sitemap.json
├── utils.wxs
└── pages/**
```

请使用微信开发者工具打开 `dist/wx`；不要打开源码项目目录。

### H5 / Web

对于 `target: 'h5'`，插件会向 `index.html` 注入生成模块，根据 `pages` 构建路由记录，并使用 Taro 的 hash-history 路由挂载应用。请在应用 CSS 中导入 `virtual:taro/css` 以包含 Taro H5 组件样式。路由使用配置中的页面路径，例如 `#/pages/index/index`。

## 从 Taro 迁移

你可以保留大多数 React 页面组件、业务逻辑、资源和样式，但构建入口会从 Taro CLI 配置迁移到 Vite 配置。

迁移清单：

1. 安装 `vite-plugin-taro`，并创建包含 `vitePluginTaro(...)` 的 `vite.config.ts`。
2. 将应用配置和页面配置移到 `vite.config.ts` 中。插件不会读取 `config/index.ts`、`app.config.ts` 或页面 `config.ts` 等 Taro 文件。
3. 在 `pages` 中注册每个页面。每个页面路径都必须匹配 `src/${path}.tsx`。
4. 将 Taro 脚本替换为设置 `VITE_PLUGIN_TARO_TARGET=wx` 或 `VITE_PLUGIN_TARO_TARGET=h5` 的 Vite 脚本。
5. 对于 H5，添加普通 Vite `index.html`，其中包含 `<div id="app"></div>`，且不要添加单独的 `src/main.tsx` 入口。
6. 将全局样式迁移到 `src/app.css`，在 app 入口保留 `import './app.css'`，并按下方示例添加 Taro/Tailwind 导入。
7. 从 `dependencies` 和 `devDependencies` 中移除所有 `@tarojs/*` 包。
8. 将应用代码中的 `@tarojs/*` 导入替换为插件虚拟模块。

迁移前：

```tsx
import Taro from '@tarojs/taro'
import { Text, View } from '@tarojs/components'
```

迁移后：

```tsx
import Taro from 'virtual:taro/api'
import { Text, View } from 'virtual:taro/components'
```

样式迁移：

```css
@layer theme, base, taro, components, utilities;

/* Taro 组件样式。 */
@import "virtual:taro/css";
/* Tailwind CSS v4 样式和工具类。 */
@import "tailwindcss";

@source "./";
```

移除所有 `@tarojs/*` 包，并且不要在应用代码中直接导入它们。请让插件负责 Taro 运行时解析。

## 示例应用

示例应用位于 [`packages/loan-genius`](https://github.com/sep2/vite-plugin-taro/tree/main/packages/loan-genius)。它展示了页面约定、目标选择、微信输出、H5 路由和 Tailwind 样式。

```sh
git clone https://github.com/sep2/vite-plugin-taro.git

# 安装依赖
pnpm install

# 首次运行，生成打过补丁的 Taro 包
pnpm prepare:taro

# 构建插件，供示例应用使用
pnpm build:plugin

# 运行微信示例应用
pnpm dev:sample:wx

# 将示例应用构建为微信输出
pnpm build:sample:wx

# 以开发模式运行 H5 示例应用
pnpm dev:sample:h5

# 将示例应用构建为 H5 输出并预览
pnpm build:sample:h5
pnpm preview:sample:h5
```

使用微信开发者工具打开 `packages/loan-genius/dist/wx`，以测试小程序输出。

## 开发本仓库

```sh
pnpm install
pnpm prepare:taro
pnpm build:plugin
pnpm typecheck
```

常用脚本：

| 脚本 | 描述 |
| --- | --- |
| `pnpm prepare:taro` | 从上游 npm tarball 和本地 patch 文件重新生成打过补丁的 React 19 Taro 包。 |
| `pnpm build:plugin` | 将 `packages/vite-plugin-taro` 构建到 `dist`。 |
| `pnpm typecheck` | 使用 `tsc` 对插件和示例应用进行类型检查。 |
| `pnpm lint` | 运行 Biome 检查。 |
| `pnpm format` | 应用 Biome 格式化。 |
| `pnpm dev:sample:wx` | 以 watch 模式构建微信小程序示例。请先构建插件。 |
| `pnpm dev:sample:h5` | 以 Vite 开发模式启动 H5 示例应用。请先构建插件。 |
| `pnpm build:sample:wx` | 将微信小程序示例构建到 `packages/loan-genius/dist/wx`。 |
| `pnpm build:sample:h5` | 将 H5 示例应用构建到 `packages/loan-genius/dist/h5`。 |
| `pnpm preview:sample:h5` | 预览构建后的 H5 示例。 |
| `pnpm changelog` | 从 git release tag 重新生成 `CHANGELOG.md`。 |
| `pnpm publish:dry` | 干运行包校验和发布流程。 |
| `pnpm release <version\|bump>` | 验证发布、更新版本、更新 changelog、创建 release commit 和 tag，并推送触发 CI 发布。 |
| `pnpm publish:all` | 按依赖顺序发布公开包；主要由基于 tag 的 Trusted Publishing 工作流调用。 |

## 限制

- 目前只支持 React 应用。
- 目前只生成 `wx` 和 `h5` 目标。
- 应用代码不能直接导入 `@tarojs/*` 包。

## 排查问题

| 问题 | 检查项 |
| --- | --- |
| `VITE_PLUGIN_TARO_TARGET must be "wx" or "h5"` | 在脚本或 `.env` 文件中设置目标环境变量。 |
| `pnpm install` 提示忽略了依赖构建脚本 | 运行 `pnpm approve-builds`，按提示批准需要构建的依赖。 |
| 页面无法解析 | 确认 `pages[].path` 有匹配的 `src/${path}.tsx` 文件。 |
| 微信开发者工具无法打开应用 | 打开生成的 `dist/wx` 文件夹，并检查 `projectConfigJson.appid`。 |
| H5 显示空白页 | 确保 `index.html` 中保留 `<div id="app"></div>`，已注册插件，并避免添加单独的默认 Vite `main.tsx` 入口。 |
| Taro API 缺失或行为不同 | 移除应用代码中直接导入的 `@tarojs/*`，并从 `virtual:taro/api` 导入 Taro。 |
| 组件在 H5 上渲染时缺少预期样式 | 确保 `src/app.css` 导入了 `virtual:taro/css`，并且 app 入口导入了 `./app.css`。 |
| Tailwind 类没有生效 | 确保 `src/app.css` 导入了 `tailwindcss`，保留 `@source "./";`，并且类名可以被静态扫描到。移动文件后请重启开发服务。 |

## 发布流程

本仓库使用 npm Trusted Publishing 和 GitHub Actions 自动发布。普通推送到 `main` 不会发布；只有推送匹配 `v*.*.*` 的 tag 才会触发 `.github/workflows/publish.yml`。

创建发布：

```sh
pnpm release patch
```

`pnpm release` 会要求干净的 `main` 工作区，运行 `pnpm version:bump`，执行 `pnpm publish:dry -- --no-git-check` 验证，创建 `chore: release vX.Y.Z` commit 和 `vX.Y.Z` tag，然后推送 branch 与 tag 触发 CI。也可以发布精确版本或预发布版本：

```sh
pnpm release 0.2.0
pnpm release prerelease --preid beta
pnpm release patch --dry-run
pnpm release patch --no-push
```

CI 会运行 `pnpm publish:all -- --no-git-check`，按依赖顺序打包并通过 npm OIDC 发布公开包。不要为发布工作流配置 `NPM_TOKEN`；每个 npm 包的 Trusted Publisher 应指向 `publish.yml`。

## 许可证

MIT
