# vite-plugin-taro

[![npm version](https://img.shields.io/npm/v/vite-plugin-taro.svg)](https://www.npmjs.com/package/vite-plugin-taro)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

简体中文 | [English](README.en.md)

使用最新标准化前端技术栈 Vite 8、React 19 和 Tailwind CSS v4 构建微信小程序。

`vite-plugin-taro` 适用于希望使用 Taro 跨平台 React 组件和 API，但更偏好 Vite 而非 Taro webpack 的应用。插件会为你生成应用/页面入口、目标运行时别名、H5 路由启动代码、微信端配套文件、Tailwind 处理，以及条件编译。

在线演示：<https://sep2.github.io/vite-plugin-taro>。如何在本地运行，请参见[示例应用](https://github.com/sep2/vite-plugin-taro/tree/main/packages/loan-genius/README.md)。

- **一套代码，双端输出** 同一套 React/Taro 页面构建 H5 与微信小程序。
- **原生 Vite 构建** 使用标准 Vite 8 配置，无需维护老旧的 webpack 配置，并支持所有 Vite 插件。
- **热更新** H5 与微信小程序都支持开发模式 watch，基于 Vite 8 热更新/快速重建即时预览。
- **依托成熟 Taro 能力** 复用久经实战检验的 Taro API 和组件，完整使用 Taro 跨端能力。
- **Tailwind 就绪** 内置 Tailwind CSS v4 支持，H5 与微信小程序样式开箱即用。
- **条件编译** 支持 Taro 风格 `#ifdef` / `#ifndef` / `#if`，可按 `h5` / `wx` 裁剪代码和样式。
- **类型友好** 通过 `virtual:taro/api` 和 `virtual:taro/components` 统一导入 Taro 能力，并提供 TypeScript 类型支持。
- **微信 Skyline** 支持微信小程序 Skyline 渲染模式输出。

## 创建新应用

```sh
pnpm create vite-taro my-app
cd my-app
pnpm install
pnpm dev:h5
```

使用 `pnpm dev:wx` 可以以 watch 模式构建微信小程序，然后在微信开发者工具中打开 `dist/wx`。

## 安装到已有应用

```sh
pnpm add -D vite-plugin-taro
```

你的应用还必须提供 Vite 8、React 19、React DOM 19、TypeScript 以及 React 类型包。如果应用尚未安装它们，请安装缺失的包：

```sh
pnpm add react react-dom
pnpm add -D vite typescript @types/react @types/react-dom
```

你不应再直接依赖任何 `@tarojs/*` 包。如果已经依赖，请将它们移除。

## 快速开始

下面的示例会创建如下源码结构：

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
    if (target === 'h5' || target === 'wx') return target
    throw new Error(`${targetEnvName} must be "h5" or "wx".`)
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

- 每次 Vite 运行时，`target` 必须是 `h5` 或 `wx`。
- `app` 是根 React 应用组件模块。它应默认导出应用组件。
- 每个 `pages[].path` 都映射到 `src/${path}.tsx` 文件。例如，`pages/index/index` 要求存在 `src/pages/index/index.tsx`。
- `appJson.pages` 会根据 `pages` 生成；你在 `appJson` 中传入的任何 `pages` 字段都会被覆盖。
- 插件不会读取 Taro CLI 配置文件，例如 `config/index.ts`、`app.config.ts` 或页面 `config.ts` 文件。请通过插件选项传入应用和页面配置。

### 3. 创建应用组件

`src/app.ts` 是共享应用包装器。它会通过 `children` 接收当前页面。

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

从应用组件中导入全局样式。它们会包含在 H5 输出中，并在微信构建中收集到 `app.wxss`。

### 4. 创建页面组件

`src/pages/index/index.tsx` 是 `pages/index/index` 对应的 React 组件。

```tsx
import { Button, Text, View } from 'virtual:taro/components'
import Taro from 'virtual:taro/api'

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

在应用代码中使用这些导入：

| 导入 | 用途 |
| --- | --- |
| `virtual:taro/components` | Taro React 组件，例如 `View`、`Text`、`Button`、`Image` 和 `ScrollView`。 |
| `virtual:taro/api` | Taro API 和 hooks，例如 `Taro.navigateTo`、`Taro.getWindowInfo` 和 `Taro.useLaunch`。 |

不要在应用代码中直接导入 `@tarojs/*` 包。此插件禁止且不支持直接使用 `@tarojs/*`，因为这可能绕过目标特定的运行时别名和 H5 API 转换。请只使用 `virtual:taro/api` 和 `virtual:taro/components`。

### 5. 添加 H5 HTML 外壳

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

### 6. 添加脚本

```json
{
    "scripts": {
        "dev:h5": "NODE_ENV=development VITE_PLUGIN_TARO_TARGET=h5 vite",
        "build:h5": "NODE_ENV=production VITE_PLUGIN_TARO_TARGET=h5 vite build",
        "dev:wx": "NODE_ENV=development VITE_PLUGIN_TARO_TARGET=wx vite build --watch",
        "build:wx": "NODE_ENV=production VITE_PLUGIN_TARO_TARGET=wx vite build"
    }
}
```

在 Windows shell 中，请使用 `cross-env`。

### 7. 运行每个目标

```sh
pnpm dev:h5       # 启动 H5 开发服务器
pnpm build:h5     # 构建 dist/h5
pnpm build:wx     # 构建 dist/wx
pnpm dev:wx       # 以 watch 模式重新构建 dist/wx
```

在微信开发者工具中打开生成的 `dist/wx` 目录。

| 目标 | 含义 | 输出目录 |
| --- | --- | --- |
| `h5` | H5 生产输出。 | `dist/h5` |
| `wx` | 开发/生产模式下的微信小程序。 | `dist/wx` |

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
| `target` | 本次 Vite 调用的活动目标。Web 使用 `h5`，微信小程序使用 `wx`。 |
| `app` | 默认导出根 React 应用组件的源码文件，例如 `src/app.ts` 或 `src/app.tsx`。 |
| `pages` | 有序页面列表。该顺序会成为 `app.json.pages` 和 H5 路由顺序。 |
| `pages[].path` | 不带扩展名的 Taro 风格路由和输出路径，例如 `pages/index/index`。页面组件必须存在于 `src/${path}.tsx`。 |
| `pages[].config` | 合并到生成的微信页面 JSON 和 H5 路由配置中的页面配置。 |
| `appJson` | 基础应用配置。插件会根据 `options.pages` 覆盖 `pages` 字段。 |
| `projectConfigJson` | `wx` 构建时输出的微信 `project.config.json` 内容。即使当前目标是 `h5`，选项类型也要求提供它。 |
| `sitemapJson` | `wx` 构建时输出的微信 `sitemap.json` 内容。即使当前目标是 `h5`，选项类型也要求提供它。 |

## 样式

你可以使用普通 CSS、CSS Modules 或 Tailwind CSS v4。

对于 Tailwind CSS v4，请从全局 CSS 文件（例如 `src/app.css`）导入 Tailwind：

```css
@import "tailwindcss/theme.css";
@import "tailwindcss/preflight.css";
@import "tailwindcss/utilities.css";

@source "./";
```

插件会为 `h5` 构建注册 `@tailwindcss/vite`，并为 `wx` 构建注册 `weapp-tailwindcss`。对于 `wx`，Vite 输出的 CSS 会被收集到 `app.wxss`，并为每个页面生成配套的 `.wxss` 文件。

## 条件编译

插件会在 Vite 解析源码之前移除非活动的 Taro 风格条件注释块。该能力适用于 `node_modules` 之外的 TypeScript、JavaScript、JSX/TSX、CSS、Sass、Less 和 Stylus 文件。

```ts
// #ifdef wx
console.log('WeChat only')
// #endif

// #ifdef h5
console.log('H5 only')
// #endif

// #if h5 && !wx
console.log('H5 expression')
// #elif wx
console.log('WeChat expression')
// #else
console.log('fallback')
// #endif
```

支持的指令包括 `#ifdef`、`#ifndef`、`#if`、`#elif`、`#else` 和 `#endif`。条件使用插件目标标记 `h5` 和 `wx`；`#if` 表达式支持 `!`、`&&` 和 `||`。

## 按目标输出

### H5

对于 `target: 'h5'`，插件会向 `index.html` 注入生成模块，导入 Taro 的 H5 组件样式，根据 `pages` 构建路由记录，并使用 Taro 的 hash-history 路由挂载应用。路由使用配置中的页面路径，例如 `#/pages/index/index`。

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

## 从 Taro 迁移

你可以保留大多数 React 页面组件、业务逻辑、资源和样式，但构建入口会从 Taro CLI 配置迁移到 Vite 配置。

迁移检查清单：

1. 安装 `vite-plugin-taro`，并创建包含 `vitePluginTaro(...)` 的 `vite.config.ts`。
2. 将应用配置和页面配置移入插件选项。插件不会读取 Taro CLI 文件，例如 `config/index.ts`、`app.config.ts` 或页面 `config.ts` 文件。
3. 在 `pages` 中注册每个页面。每个页面路径都必须匹配 `src/${path}.tsx`。
4. 将 Taro 脚本替换为设置 `VITE_PLUGIN_TARO_TARGET=h5` 或 `VITE_PLUGIN_TARO_TARGET=wx` 的 Vite 脚本。
5. 对于 H5，添加普通 Vite `index.html`，其中包含 `<div id="app"></div>`，且不要添加单独的 `src/main.tsx` 入口。
6. 将应用中的 `@tarojs/*` 导入替换为插件虚拟模块。

之前：

```tsx
import Taro from '@tarojs/taro'
import { Text, View } from '@tarojs/components'
```

之后：

```tsx
import Taro from 'virtual:taro/api'
import { Text, View } from 'virtual:taro/components'
```

应用代码中禁止直接导入 `@tarojs/*`。请让插件负责 Taro 运行时解析，使 H5 和微信构建都获得正确的目标特定别名。

## 示例应用

示例应用位于 [`packages/loan-genius`](https://github.com/sep2/vite-plugin-taro/tree/main/packages/loan-genius)。它展示了页面约定、目标选择、H5 路由、Tailwind 样式和微信输出。

```sh
git clone https://github.com/sep2/vite-plugin-taro.git

# 安装依赖
pnpm install

# 运行一次，用于生成打过补丁的 Taro 包
pnpm prepare:taro

# 构建插件供示例应用使用
pnpm build:plugin

# 以开发模式运行 H5 示例应用
pnpm dev:sample:h5

# 将示例应用构建为 H5 输出并预览
pnpm build:sample:h5
pnpm preview:sample:h5

# 运行微信示例应用
pnpm dev:sample:wx

# 将示例应用构建为微信输出
pnpm build:sample:wx
```

使用微信开发者工具打开 `packages/loan-genius/dist/wx`，以测试小程序输出。


## 开发此仓库

```sh
pnpm install
pnpm prepare:taro
pnpm build:plugin
pnpm typecheck
```

常用脚本：

| 脚本 | 描述 |
| --- | --- |
| `pnpm prepare:taro` | 从上游 npm tarball 和本地补丁文件重新生成打过补丁的 React 19 Taro 包。 |
| `pnpm build:plugin` | 将 `packages/vite-plugin-taro` 构建到 `dist`。 |
| `pnpm typecheck` | 使用 `tsgo` 对插件和示例应用进行类型检查。 |
| `pnpm lint` | 运行 Biome 检查。 |
| `pnpm format` | 应用 Biome 格式化。 |
| `pnpm dev:sample:h5` | 以 Vite 开发模式启动 H5 示例应用。请先构建插件。 |
| `pnpm dev:sample:wx` | 以 watch 模式构建微信小程序示例。请先构建插件。 |
| `pnpm build:sample:h5` | 将 H5 示例应用构建到 `packages/loan-genius/dist/h5`。 |
| `pnpm preview:sample:h5` | 预览构建后的 H5 示例。 |
| `pnpm build:sample:wx` | 将微信小程序示例构建到 `packages/loan-genius/dist/wx`。 |
| `pnpm publish:dry` | 对包校验和发布流程进行 dry-run。 |
| `pnpm publish:all` | 按依赖顺序发布所有公开包。 |

## 限制

- 目前只生成 `h5` 和 `wx` 目标。
- 应用代码不得直接导入 `@tarojs/*` 包。


## 故障排查

| 问题 | 检查项 |
| --- | --- |
| `VITE_PLUGIN_TARO_TARGET must be "h5" or "wx"` | 在脚本或 `.env` 文件中设置目标环境变量。 |
| 页面无法解析 | 确认 `pages[].path` 有匹配的 `src/${path}.tsx` 文件。 |
| H5 显示空白页 | 确保 `index.html` 中保留 `<div id="app"></div>`，已注册插件，并避免添加单独的默认 Vite `main.tsx` 入口。 |
| Taro API 缺失或行为不同 | 移除应用代码中直接导入的 `@tarojs/*`，并从 `virtual:taro/api` 导入 Taro。 |
| 组件在 H5 上渲染时缺少预期样式 | 从 `virtual:taro/components` 导入组件，并确保 `h5` 目标启用了插件。 |
| 微信开发者工具无法打开应用 | 打开生成的 `dist/wx` 文件夹，并检查 `projectConfigJson.appid`。 |
| Tailwind 类没有生效 | 确保全局 CSS 导入 Tailwind，并包含覆盖源码文件的 `@source` 路径。 |

## 发布流程

发布前先验证可发布包：

```sh
pnpm publish:dry
```

按要求顺序发布所有公开包：

```sh
pnpm publish:all
```


## 许可证

MIT
