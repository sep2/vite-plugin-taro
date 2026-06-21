# vite-plugin-taro

[![npm version](https://img.shields.io/npm/v/vite-plugin-taro.svg)](https://www.npmjs.com/package/vite-plugin-taro)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Vite 8 plugin for building one React 19 + Taro 4 app as either Web (`h5`) or WeChat Mini Program (`wx`).

## Highlights

- Builds the same React/Taro pages for `h5` and `wx` targets.
- Uses React 19-compatible Taro React packages published by this monorepo.
- Generates Taro-style app/page entries instead of requiring generated files in your app source.
- Emits WeChat Mini Program assets: `app.json`, page JSON, WXML, WXS, WXSS, and CommonJS chunks.
- Boots H5 with Taro's official router/runtime and component CSS.
- Handles Tailwind CSS v4 for H5 and transforms Tailwind output for WeChat Mini Programs.
- Strips inactive Taro-style conditional compilation blocks before Vite parses code.
- Provides app-facing facades for Taro APIs and components.

## Compatibility

| Dependency | Supported version |
| --- | --- |
| Node.js | `^20.19.0` or `>=22.12.0` |
| Vite | `^8.0.0` |
| React / React DOM | `^19.0.0` |
| Taro runtime packages | `4.2.0` |
| Tailwind CSS | `4.x` |

## Install

```sh
pnpm add -D vite vite-plugin-taro
pnpm add react react-dom
```

## Public entries

| Import | Use |
| --- | --- |
| `vite-plugin-taro` | Plugin entry. Exports the default plugin plus option/target types. |
| `vite-plugin-taro/client` | TypeScript declarations for the app-facing virtual modules. |
| `virtual:taro/components` | Virtual re-export of Taro React components. Use this in application code. |
| `virtual:taro/api` | Virtual Taro API facade. Use this instead of importing `@tarojs/taro` directly. |
| `vite-plugin-taro/shim/h5` | Internal H5 runtime shim used by generated entries. |
| `vite-plugin-taro/shim/wx` | Internal WeChat runtime shim used by generated entries. |

Application code should normally use only `virtual:taro/components` and `virtual:taro/api`.

## Minimal setup

### TypeScript config

Add the virtual module declarations to `tsconfig.json`:

```json
{
    "compilerOptions": {
        "types": ["vite/client", "vite-plugin-taro/client"]
    }
}
```

### Vite config

```ts
import { defineConfig, loadEnv } from 'vite'
import vitePluginTaro, { type VitePluginTaroTarget } from 'vite-plugin-taro'

function getTarget(value: string | undefined): VitePluginTaroTarget {
    if (value === 'h5' || value === 'wx') return value
    throw new Error('VITE_PLUGIN_TARO_TARGET must be "h5" or "wx".')
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'VITE_PLUGIN_TARO_')
    const target = getTarget(env.VITE_PLUGIN_TARO_TARGET)

    return {
        base: target === 'h5' ? './' : undefined,
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
                appJson: {},
                projectConfigJson: {
                    appid: env.VITE_PLUGIN_TARO_WECHAT_APP_ID || 'touristappid'
                },
                sitemapJson: {
                    rules: [{ action: 'allow', page: '*' }]
                }
            })
        ]
    }
})
```

### App component

`app` points to a module that default-exports the root React app component.

```tsx
// src/app.ts
import type { PropsWithChildren } from 'react'
import Taro from 'virtual:taro/api'
import './app.css'

export default function App({ children }: PropsWithChildren) {
    Taro.useLaunch(() => {
        console.log('App launch')
    })

    return children
}
```

### Page component

Each `pages[].path` maps to `src/${path}.tsx`.

```tsx
// src/pages/index/index.tsx
import { Text, View } from 'virtual:taro/components'
import Taro from 'virtual:taro/api'

export default function IndexPage() {
    const windowInfo = Taro.getWindowInfo()

    return (
        <View>
            <Text>Viewport width: {windowInfo.windowWidth}</Text>
        </View>
    )
}
```

### HTML shell for H5

For H5 builds, keep a normal Vite `index.html`. The plugin injects the generated Taro H5 entry automatically.

```html
<div id="app"></div>
```

## Plugin options

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

| Option | Description |
| --- | --- |
| `target` | Active target for this Vite invocation: `h5` or `wx`. |
| `app` | Source file that default-exports the root React app component. |
| `pages` | Ordered page list. The order becomes `app.json.pages` and the H5 route order. |
| `pages[].path` | Taro-style route and output path without extension, for example `pages/index/index`. The page component must exist at `src/${path}.tsx`. |
| `pages[].config` | Page JSON config merged into WeChat page JSON and H5 route config. |
| `appJson` | Base app config. The plugin overwrites `pages` from `options.pages`. |
| `projectConfigJson` | WeChat `project.config.json` content emitted for `wx` builds. |
| `sitemapJson` | WeChat `sitemap.json` content emitted for `wx` builds. |

## Scripts in your app

Use separate scripts or environment files to build each target.

```json
{
    "scripts": {
        "dev:h5": "VITE_PLUGIN_TARO_TARGET=h5 vite",
        "build:h5": "VITE_PLUGIN_TARO_TARGET=h5 vite build",
        "dev:wx": "VITE_PLUGIN_TARO_TARGET=wx vite build --watch",
        "build:wx": "VITE_PLUGIN_TARO_TARGET=wx vite build"
    }
}
```

On Windows shells, use `cross-env` or your package manager's environment-file support.

## Conditional compilation

The plugin strips inactive Taro-style conditional comment blocks before Vite parses source files. Supported source types include TypeScript, JavaScript, JSX/TSX, CSS, Sass, Less, and Stylus.

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

Supported directives are `#ifdef`, `#ifndef`, `#if`, `#elif`, `#else`, and `#endif`. Expressions support target tokens with `!`, `&&`, and `||`.

## Styling

- H5 builds use `@tailwindcss/vite`.
- WeChat builds use `weapp-tailwindcss` with Tailwind CSS v4 support, `px`/`rem` to `rpx` conversion, and WeChat-compatible selector output.
- CSS emitted by Vite for `wx` is collected into `app.wxss`; page-level `.wxss` files are emitted as companions.
- Import global styles from the app component, for example `import './app.css'`.

## Target outputs

### `h5`

The plugin injects a virtual module into `index.html`, imports Taro's component styles, creates H5 route records from `pages`, mounts the root app, and uses Taro's hash-history router.

Typical output directory:

```text
dist/h5/
```

### `wx`

The plugin configures Rolldown for WeChat-compatible CommonJS chunks and emits Mini Program companion files.

Typical output directory:

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

Open the `wx` output directory with WeChat DevTools.

## Limitations

- Supported targets are currently `h5` and WeChat Mini Program (`wx`). Other Taro platforms are not generated by this plugin.
- Page modules follow the fixed convention `src/${page.path}.tsx`.
- `projectConfigJson` and `sitemapJson` are required by the option type even though they are only emitted for `wx` builds.
- Import Taro APIs/components through `virtual:taro/api` and `virtual:taro/components`; direct `@tarojs/*` imports can bypass target aliases.

## Troubleshooting

| Problem | Check |
| --- | --- |
| `VITE_PLUGIN_TARO_TARGET must be "h5" or "wx"` | Set the target environment variable before running Vite. |
| A page cannot be resolved | Confirm that `pages[].path` has a matching `src/${path}.tsx` file. |
| H5 component styles load in the wrong order | Make sure the plugin is registered and `virtual:taro/components` is used for components. |
| WeChat DevTools cannot open the project | Check `projectConfigJson.appid` and open the generated `dist/wx` directory, not the source package. |
| Taro APIs behave differently per target | Import from `virtual:taro/api` so the plugin can apply target-specific runtime aliases and H5 API transforms. |

## License

MIT. See [`LICENSE`](LICENSE).
