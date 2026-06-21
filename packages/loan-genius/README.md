# Loan Genius

简体中文 | [English](README.en.md)

Loan Genius 是 `vite-plugin-taro` 的示例应用。它是一个基于 React 19 + Taro 的贷款计算器，使用本仓库推荐的最新标准前端技术栈构建：Vite 8、React 19 和 Tailwind CSS v4。

该应用改造自 [`wuba/Taro-Mortgage-Calculator`](https://github.com/wuba/Taro-Mortgage-Calculator)，用于演示 `vite-plugin-taro` 的用法。

- H5 在线演示：<https://sep2.github.io/vite-plugin-taro/>
- 源码：[`packages/loan-genius`](https://github.com/sep2/vite-plugin-taro/tree/main/packages/loan-genius)

## 环境要求

| 工具 | 版本 / 用途 |
| --- | --- |
| Node.js | `>=22` |
| pnpm | `11.x` |
| 微信开发者工具 | 仅在打开 `dist/wx` 时需要。 |

## 从全新克隆运行

请在仓库根目录运行以下命令：

```sh
pnpm install
pnpm prepare:taro
pnpm build:plugin
```

全新克隆后必须运行 `pnpm prepare:taro`，因为打过补丁的 Taro workspace 包产物是生成文件，不会提交到仓库。

## H5

启动 H5 开发服务器：

```sh
pnpm dev:sample:h5
```

构建并预览 H5 应用：

```sh
pnpm build:sample:h5
pnpm preview:sample:h5
```

H5 产物会写入：

```text
packages/loan-genius/dist/h5
```

## 微信小程序

构建一次微信小程序：

```sh
pnpm build:sample:wx
```

或以 watch 模式重新构建：

```sh
pnpm dev:sample:wx
```

微信小程序产物会写入：

```text
packages/loan-genius/dist/wx
```

请在微信开发者工具中打开 `packages/loan-genius/dist/wx`，不要打开源码包目录。

## 本示例演示的内容

- 使用同一套 React 19 + Taro 源码同时支持 `h5` 和 `wx`。
- 通过 `VITE_PLUGIN_TARO_TARGET` 进行 `vite-plugin-taro` 目标选择。
- 在 `vite.config.ts` 中声明应用和页面元数据。
- H5 开发服务器、H5 构建，以及微信小程序构建产物。
- 从 `src/app.css` 引入 Tailwind CSS v4。
- 应用侧通过 `virtual:taro/api` 和 `virtual:taro/components` 导入能力。
- 生成微信 `project.config.json`、`sitemap.json`、WXML、WXS、WXSS 和 CommonJS chunk。

应用代码不要直接导入或安装 `@tarojs/*` 包。请改用插件提供的虚拟模块：

```tsx
import Taro from 'virtual:taro/api'
import { Text, View } from 'virtual:taro/components'
```

## 环境变量

| 变量 | 是否必需 | 说明 |
| --- | --- | --- |
| `VITE_PLUGIN_TARO_TARGET` | 是 | 由根目录脚本设置为 `h5` 或 `wx`。 |
| `VITE_PLUGIN_TARO_WECHAT_APP_ID` | 否 | 微信小程序 app id。默认值为 `touristappid`。 |

如需在本地测试微信小程序，请将你的 app id 写入 `packages/loan-genius/.env.local`：

```env
VITE_PLUGIN_TARO_WECHAT_APP_ID=your_app_id
```

## 项目结构

```text
packages/loan-genius/
├── index.html
├── vite.config.ts
└── src/
    ├── app.ts
    ├── app.css
    ├── components/
    ├── pages/
    │   └── calculator/
    └── utils/
```

重要文件：

| 文件 | 用途 |
| --- | --- |
| `vite.config.ts` | 选择目标，配置别名、输出目录、页面、应用配置和微信项目元数据。 |
| `src/app.ts` | 传给 `vite-plugin-taro` 的 React 根应用组件。 |
| `src/app.css` | 全局 Tailwind CSS v4 引入和应用样式。 |
| `src/pages/calculator/index.tsx` | 首页和默认路由。 |
| `src/pages/calculator/monthly-payments/index.tsx` | 月供明细页面。 |
| `src/pages/calculator/history/index.tsx` | 计算历史页面。 |

## 添加页面

1. 在 `src/pages` 下创建页面组件，例如 `src/pages/about/index.tsx`。
2. 在 `vite.config.ts` 的 `pages` 中添加路由：

```ts
{
    path: 'pages/about/index',
    config: {
        navigationBarTitleText: 'About'
    }
}
```

3. 通过插件虚拟模块导入 Taro API 和组件：

```tsx
import Taro from 'virtual:taro/api'
import { Text, View } from 'virtual:taro/components'
```

## 许可证

MIT
