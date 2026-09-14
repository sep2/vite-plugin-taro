---
title: 配置选项
description: 配置构建目标、App、页面和小程序项目文件。
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
| `zfb` | 支付宝小程序 |
| `h5` | Web 应用 |

一次 Vite 运行只构建一个目标。默认模板已经提供 `dev:wx`、`dev:zfb`、`dev:h5`、`build:wx`、`build:zfb` 和 `build:h5`。

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
import { View } from 'virtual:taro/components'
import './app.css'

function App({ children }: PropsWithChildren) {
    useLaunch(() => {
        console.log('App launched')
    })

    return <View className="app-shell">{children}</View>
}

export default App
```

页面内容通过 `children` 传入。App 返回的 JSX 会在 Web 和小程序目标中包裹页面，因此全局布局、全局样式、
App 生命周期、React Provider 和应用级初始化都可以放在这里。

小程序构建仍然只有一个 React App 实例。页面切换不会为每个原生 Page 重新创建 App；App 的 Context、Hook
状态、Effect 和 Ref 都沿普通的 App → Page React 父子关系保留。每个原生 Page 仍使用独立的数据更新边界。
完整用法和生命周期区别参见 [App 与页面](/guides/app-and-pages/)。

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

页面文件必须默认导出 React 组件。数组顺序决定小程序 `app.json.pages` 和 H5 路由顺序；第一项是小程序首页。

### `pages[].config`

页面配置可选；省略时等同于 `{}`：

```ts
{
    path: 'pages/about/index'
}
```

小程序构建将它写入对应的页面 JSON，H5 构建将它用于对应路由。

`usingComponents` 由 vpt 自动管理，无需填写。接入方式参见[原生组件](/guides/native-components/)。

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

小程序构建用它生成 `app.json`。H5 构建也会使用其中适用于 Taro Web 的应用配置。

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

微信 App ID 建议保存在被 Git 忽略的 `.env.local`：

```dotenv
VITE_VPT_WECHAT_APP_ID=wx1234567890abcdef
VITE_VPT_ALIPAY_APP_ID=2021000000000000
```

热更新所需设置参见[开发热更新](/guides/hot-module-replacement/)。

## `projectPrivateConfigJson`

可选。提供时写入 `project.private.config.json`：

```ts
projectPrivateConfigJson: {
    setting: {
        urlCheck: false
    }
}
```

ZFB 和 H5 构建忽略该选项。

## `sitemapJson`

可选。仅 WX 提供时写入 `sitemap.json`；ZFB 和 H5 忽略它：

```ts
sitemapJson: {
    rules: [{ action: 'allow', page: '*' }]
}
```


## `polyfills`

可选。当小程序需要运行环境尚未提供的 JavaScript / Web API 时，用此选项补充：

```ts
polyfills: ['web.url', 'es.array.at', '...']
```

使用 [core-js 模块名](https://github.com/zloirock/core-js#web-standards)，不带 `core-js/modules/` 前缀或 `.js` 后缀。
无需额外安装 core-js，也无需在应用代码中手动导入。

- 缺失或不符合标准的全局 API 和原型方法会被补充或修复，符合标准的原生实现会保留。
- 省略或传入 `[]` 时，不添加任何可选 polyfill。
- 只打包所选模块及其依赖。polyfill 会增加小程序包体积，请按应用实际需求选择。
- H5 忽略该选项；H5 的旧浏览器支持可另行配置 `@vitejs/plugin-legacy`。

需要 `URL` 和 `URLSearchParams` 时，选择 `web.url` 即可。如果还需要 `URL.parse`，使用
`polyfills: ['web.url', 'web.url.parse']`。

全局 API 安装在 `globalThis` 上。在微信中，可以直接使用 `new globalThis.URL(...)`。
由于微信默认并不支持全局对象的写法 `new URL(...)`，请在 **Vite 顶层配置**（不是 `vpt()` 选项）中添加：

```ts
define: { URL: 'globalThis.URL' }
```

这样就可以直接使用 `new URL(...)`。

`polyfills` 负责为小程序提供 API，`define` 让小程序里支持直接使用全局的 `URL` 名称。
它不会修改字符串、注释或局部变量中的 `URL`。

同理，选择 `web.self` 后，如果微信代码需要直接引用 `self`，可添加 `self: 'globalThis.self'`。


## `hmr`

可选。为 `vite serve` 的小程序开发者工具选择源码更新方式：

```ts
hmr: {
    mode: 'interpreter'
}
```

| `mode` | 行为                                                                     |
| --- |--------------------------------------------------------------------------|
| `devtools` | 默认值。把原生补丁写入项目，由小程序开发工具重新执行 Page。              |
| `interpreter` | 通过 Vite 现有 WebSocket 推送源码，使用解释器执行代码，不重新注册 Page。 |
| `rebuild` | 每次有效源码变化都重新生成完整原生项目并重启 App，不创建或应用增量补丁。 |

该选项不改变 H5 或生产构建输出。


## 生成的小程序配置文件

| vpt 配置 | WX 输出 | ZFB 输出 |
| --- | --- | --- |
| `appJson` 和 `pages` | `app.json` | `app.json` |
| `pages[].config` | `${path}.json` | `${path}.json` |
| `projectConfigJson` | `project.config.json` | `mini.project.json` |
| `projectPrivateConfigJson` | `project.private.config.json` | — |
| `sitemapJson` | `sitemap.json` | — |

## Vite 配置

下面这些设置继续使用 Vite，不放入 `vpt()`：

| 需求 | 配置位置 |
| --- | --- |
| 输出目录 | `build.outDir` |
| H5 部署基础路径 | `base` |
| 源码别名 | `resolve.alias` |
| 全局标识符替换 | `define` |
| PostCSS | `css.postcss` 或 PostCSS 配置文件 |
| 静态文件 | `public` 目录 |
| 开发服务器 | `server` |
| 其他构建扩展 | Vite 插件 |

H5 需要项目根目录下的 `index.html`，其中包含挂载节点：

```html
<div id="app"></div>
```

不需要 `src/main.tsx`，也不需要在 HTML 中添加入口脚本。vpt 会生成并注入入口。小程序构建都不使用 `index.html`。

### 小程序中的浏览器式全局变量

WX 和 ZFB 中可以直接使用以下名称，无需额外安装依赖或手动导入：

- `window`、`document`、`navigator`；
- `requestAnimationFrame`、`cancelAnimationFrame`；
- `Element`、`SVGElement`、`MutationObserver`；
- `history`、`location`。

这些 API 是 Taro 提供的小程序兼容实现，并不提供完整的浏览器环境。需要 `URL` 和 `URLSearchParams` 时，
如果运行环境未提供，请配置 [`polyfills: ['web.url']`](#polyfills)。

## 不读取 Taro 配置

vpt 不读取：

- `config/index.ts`、`config/dev.ts`、`config/prod.ts`；
- `src/app.config.ts`；
- 页面旁的 `*.config.ts`；
- 手写的 `app.json` 或页面 JSON；
- 手写的小程序分包声明。

已有 Taro 项目需要把这些配置移入 `vite.config.ts`。参见[从 Taro 迁移](/guides/migrate-from-taro/)。

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

function readJson(relativePath: string): Record<string, unknown> {
    return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'))
}
```

这些文件只是配置的存储方式，生成规则不变。例如，`config/app.json` 中的 `pages` 和分包声明仍会由 vpt 的构建结果替换。
