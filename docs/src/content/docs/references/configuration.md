---
title: 配置选项
description: VPT 的 Vite 配置与插件选项参考。
---

在 `vite.config.ts` 中调用 `vpt()`。每次 Vite 运行只构建一个目标，目标由环境变量或其他配置逻辑决定。

```ts
import { defineConfig, loadEnv } from 'vite'
import vpt, { type VptTarget } from 'vite-plugin-taro'

function getTarget(value: string | undefined): VptTarget {
    if (value === 'wx' || value === 'h5') return value
    throw new Error('VITE_VPT_TARGET must be "wx" or "h5".')
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'VITE_VPT_')
    const target = getTarget(env.VITE_VPT_TARGET)

    return {
        build: {
            outDir: `dist/${target}`
        },
        plugins: [
            vpt({
                target,
                app: 'src/app.tsx',
                pages: [
                    {
                        path: 'pages/index/index',
                        config: { navigationBarTitleText: '首页' }
                    }
                ],
                appJson: {
                    window: { navigationBarTitleText: '示例应用' }
                },
                projectConfigJson: {
                    appid: env.VITE_VPT_WECHAT_APP_ID || 'touristappid',
                    projectname: 'vite-taro-app',
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

## 类型

```ts
type VptJsonObject = Record<string, unknown>

type VptTarget = 'wx' | 'h5'

type VptPageOption = {
    path: string
    config: VptJsonObject
}

interface VptOptions {
    target: VptTarget
    app: string
    pages: VptPageOption[]
    appJson: VptJsonObject
    projectConfigJson: VptJsonObject
    projectPrivateConfigJson?: VptJsonObject
    sitemapJson?: VptJsonObject
}
```

## 选项

| 选项 | 说明                                                                                                       |
| --- |------------------------------------------------------------------------------------------------------------|
| `target` | 当前 Vite 调用的构建目标。微信小程序使用 `wx`，Web 使用 `h5`。                                             |
| `app` | 默认导出 React 根应用组件的源码模块，例如 `src/app.tsx`。                                                  |
| `pages` | 有序页面列表。顺序会成为 `app.json.pages` 和 Web 路由顺序。                                                |
| `pages[].path` | 不带扩展名的 Taro 路由与输出路径，例如 `pages/index/index`。对应文件必须位于 `src/pages/index/index.tsx`。 |
| `pages[].config` | 合并到微信页面 JSON 和 Web 路由配置的页面配置。                                                            |
| `appJson` | 微信应用配置。vpt 会根据 `pages` 生成并覆盖 `pages`，并自行管理分包声明。                                  |
| `projectConfigJson` | 微信构建时原样输出为 `project.config.json`。接口要求始终提供，Web 构建不会写出该文件。                     |
| `projectPrivateConfigJson` | 可选的微信私有项目配置；提供时原样输出为 `project.private.config.json`。                                   |
| `sitemapJson` | 可选的微信小程序索引规则；提供时原样输出为 `sitemap.json`，Web 构建不会写出该文件。                         |

## 入口与页面约定

- `app` 指向共享应用包装组件。组件通过 `children` 接收当前页面，并应在这里导入全局样式。
- 每个 `pages[].path` 都映射到 `src/${path}.tsx`。
- 插件不读取 `config/index.ts`、`app.config.ts` 或页面 `config.ts` 等 Taro CLI 配置文件；请将配置直接传给插件。
- H5 项目需要包含带有 `<div id="app"></div>` 的普通 Vite `index.html`，不需要额外的 `src/main.tsx`。

## 条件编译

插件支持在 TypeScript、JavaScript、JSX/TSX、CSS、Sass、Less 和 Stylus 源码中使用 Taro 风格条件块：

```ts
// #ifdef wx
console.log('仅微信小程序')
// #endif

// #ifdef h5
console.log('仅 Web')
// #endif

// #ifndef h5
console.log('非 Web 目标')
// #else
console.log('Web 目标')
// #endif
```

支持 `#ifdef`、`#ifndef`、`#else` 和 `#endif`，目标标记为 `wx` 与 `h5`。
