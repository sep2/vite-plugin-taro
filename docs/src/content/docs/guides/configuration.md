---
title: 配置选项
description: 配置构建目标、App、页面和微信项目文件。
---

`create-vite-taro` 生成的项目在 `vite.config.ts` 中调用 `vpt()`。以下是 `vpt()` 的全部公开选项。

## `target`

选择本次构建的目标：

```ts
target: 'wx'
```

| 值 | 输出 |
| --- | --- |
| `wx` | 微信小程序 |
| `h5` | Web 应用 |

一次 Vite 运行只构建一个目标。默认模板已经为 `dev:wx`、`dev:h5`、`build:wx` 和 `build:h5` 传入对应值。

输出目录由 Vite 配置，不属于 `vpt()`：

```ts
build: {
    outDir: `dist/${target}`
}
```

## `app`

指定 App 组件：

```ts
app: 'src/app.tsx'
```

路径相对于 Vite 项目根目录。该文件必须默认导出 React 组件：

```tsx
import type { PropsWithChildren } from 'react'
import { useLaunch } from 'virtual:taro/api'
import './app.css'

function App({ children }: PropsWithChildren) {
    useLaunch(() => {
        console.log('App launched')
    })

    return children
}

export default App
```

当前页面通过 `children` 传入。全局样式、App 生命周期、React Provider 和应用级初始化通常放在这里。

## `pages`

声明应用的全部页面：

```ts
pages: [
    {
        path: 'pages/home/index',
        config: {
            navigationBarTitleText: '首页'
        }
    },
    {
        path: 'pages/profile/index',
        config: {
            navigationBarTitleText: '个人中心',
            enablePullDownRefresh: true
        }
    }
]
```

vpt 不扫描目录。新增页面时，必须创建页面文件并把它加入 `pages`。

### `pages[].path`

`path` 同时是页面路由和 `src` 下的源码路径，不包含文件扩展名：

```text
path: 'pages/profile/index'
源码: src/pages/profile/index.tsx
```

页面文件必须默认导出 React 组件。数组顺序决定微信 `app.json.pages` 和 H5 路由的顺序；第一项是微信小程序首页。

### `pages[].config`

页面配置必须提供；没有配置时写 `{}`：

```ts
{
    path: 'pages/about/index',
    config: {}
}
```

微信构建将它写入对应的页面 JSON，H5 构建将它用于对应路由。

如果填写 `usingComponents`，vpt 会保留其中的自定义注册，并补充 Taro 和 `virtual:taro/native` 所需的组件注册。不要手写这些生成项。

:::note
`pages` 声明的都是微信主包页面。vpt 的自动分包处理动态导入的代码和相关资源，不处理微信原生页面分包。参见[全自动分包](/guides/automatic-subpackages/)。
:::

## `appJson`

配置应用级行为：

```ts
appJson: {
    lazyCodeLoading: 'requiredComponents',
    window: {
        navigationBarTitleText: '示例应用'
    },
    tabBar: {
        color: '#64748b',
        selectedColor: '#16a34a',
        list: [
            { pagePath: 'pages/home/index', text: '首页' },
            { pagePath: 'pages/profile/index', text: '我的' }
        ]
    }
}
```

微信构建用它生成 `app.json`。H5 构建也会使用其中适用于 Taro Web 的应用配置。

以下由 vpt 自动维护，无需填写：

| 字段 | 来源 |
| --- | --- |
| `pages` | 根据 `pages` 选项生成 |
| `subPackages` / `subpackages` | 根据自动分包结果生成 |
| `routes` | 根据 `pages` 生成 H5 路由 |

即使传入这些字段，vpt 也会用构建结果替换它们。

`appJson` 接受普通 JSON 对象。字段名称和取值以微信小程序与 Taro 文档为准。Skyline 配置也写在这里，参见[Skyline 模式](/guides/skyline-mode/)。

## `projectConfigJson`

配置微信开发者工具项目：

```ts
projectConfigJson: {
    appid: wechatAppId,
    projectname: 'vite-taro-app',
    compileType: 'miniprogram',
    setting: {
        compileHotReLoad: true,
        urlCheck: false,
        skylineRenderEnable: false
    }
}
```

微信构建将该对象写入 `project.config.json`。vpt 不添加默认值，建议在模板配置上修改，而不是从空对象重新编写。

该选项始终必填，但 H5 构建会忽略它。只构建 H5 的项目可以传入 `{}`。

微信 App ID 建议保存在被 Git 忽略的 `.env.local`：

```dotenv
VITE_VPT_WECHAT_APP_ID=wx1234567890abcdef
```

热更新所需设置参见[开发者工具热更新](/guides/hot-module-replacement/)。

## `projectPrivateConfigJson`

可选。提供时写入 `project.private.config.json`：

```ts
projectPrivateConfigJson: {
    setting: {
        urlCheck: false
    }
}
```

H5 构建忽略该选项。

## `sitemapJson`

可选。提供时写入 `sitemap.json`：

```ts
sitemapJson: {
    rules: [{ action: 'allow', page: '*' }]
}
```

H5 构建忽略该选项。

## 生成的微信配置文件

| vpt 配置 | 输出文件 |
| --- | --- |
| `appJson` 和 `pages` | `app.json` |
| `pages[].config` | `${path}.json` |
| `projectConfigJson` | `project.config.json` |
| `projectPrivateConfigJson` | `project.private.config.json` |
| `sitemapJson` | `sitemap.json` |

## Vite 配置

下面这些设置继续使用 Vite，不放入 `vpt()`：

| 需求 | 配置位置 |
| --- | --- |
| 输出目录 | `build.outDir` |
| H5 部署基础路径 | `base` |
| 源码别名 | `resolve.alias` |
| PostCSS | `css.postcss` 或 PostCSS 配置文件 |
| 静态文件 | `public` 目录 |
| 开发服务器 | `server` |
| 其他构建扩展 | Vite 插件 |

H5 需要项目根目录下的 `index.html`，其中包含挂载节点：

```html
<div id="app"></div>
```

不需要 `src/main.tsx`，也不需要在 HTML 中添加入口脚本。vpt 会生成并注入入口。微信构建不使用 `index.html`。

## 条件编译

目标专用源码可以使用条件块。

TypeScript、JavaScript 和 JSX/TSX 使用行注释：

```ts
// #ifdef wx
console.log('仅微信小程序')
// #endif

// #ifdef h5
console.log('仅 H5')
// #else
console.log('非 H5 目标')
// #endif
```

样式使用块注释：

```css
/* #ifdef wx */
.platform-panel {
    padding: 32rpx;
}
/* #endif */

/* #ifdef h5 */
.platform-panel {
    padding: 1rem;
}
/* #endif */
```

支持：

- `#ifdef wx` 和 `#ifdef h5`；
- `#ifndef`；
- `#else`；
- `#endif`；
- 嵌套条件。

不支持 `#if` 和 `#elif`。

条件编译适用于项目中的 TypeScript、JavaScript、JSX/TSX、CSS、Sass、Less 和 Stylus，不处理 `node_modules`。

`tsc` 会把标记视为注释，因此仍会检查所有分支。每个分支都必须是合法的 TypeScript。

## 不读取 Taro CLI 配置

vpt 不读取：

- `config/index.ts`、`config/dev.ts`、`config/prod.ts`；
- `src/app.config.ts`；
- 页面旁的 `*.config.ts`；
- 手写的 `app.json` 或页面 JSON；
- 手写的微信分包声明。

已有 Taro 项目需要把这些配置移入 `vite.config.ts`。参见[从 Taro CLI 迁移](/guides/migrate-from-taro/)。

## 使用独立 JSON 文件

如果希望把配置保留为真实 JSON 文件，可以在 `vite.config.ts` 中使用 Node.js `fs` 读取，再传给 vpt：

```text
config/
├── app.json
├── pages/home.json
├── project.config.json
├── project.private.config.json
└── sitemap.json
```

```ts
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vpt from 'vite-plugin-taro'

function readJson(relativePath: string): Record<string, unknown> {
    return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'))
}

export default defineConfig({
    build: {
        outDir: 'dist/wx'
    },
    plugins: [
        vpt({
            target: 'wx',
            app: 'src/app.tsx',
            pages: [
                {
                    path: 'pages/home/index',
                    config: readJson('./config/pages/home.json')
                }
            ],
            appJson: readJson('./config/app.json'),
            projectConfigJson: readJson('./config/project.config.json'),
            projectPrivateConfigJson: readJson('./config/project.private.config.json'),
            sitemapJson: readJson('./config/sitemap.json')
        })
    ]
})
```

这些文件只是配置的存储方式，生成规则不变。例如，`config/app.json` 中的 `pages` 和分包声明仍会由 vpt 的构建结果替换。
