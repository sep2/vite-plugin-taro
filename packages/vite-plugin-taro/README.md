# vite-plugin-taro

Vite 8 + React 19 plugin for building one React/Taro codebase for both:

- `wx`: WeChat Mini Program output.
- `h5`: Web output powered by the Taro H5 runtime and router.

It wraps the official Taro React runtimes, emits the generated app/page entries that Taro normally creates, and configures Vite/Rolldown, Tailwind CSS, and target-specific aliases for the selected target.

## Package exports

| Import | Purpose |
| --- | --- |
| `vite-plugin-taro/components` | Re-export of `@tarojs/components`. Use this in app code. |
| `vite-plugin-taro/taro` | Taro API facade. Use this instead of importing `@tarojs/taro` directly. |
| `vite-plugin-taro/vite` | Default Vite plugin and `VitePluginTaroTarget`, `VitePluginTaroOptions`, `VitePluginTaroPageOption` types. |
| `vite-plugin-taro/shim/h5` | H5 runtime shim used by generated entries. |
| `vite-plugin-taro/shim/wx` | WeChat runtime shim used by generated entries. |

Application code should usually import only `vite-plugin-taro/components` and `vite-plugin-taro/taro`.

## Vite usage

```ts
import vitePluginTaro, { type VitePluginTaroTarget } from 'vite-plugin-taro/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'VITE_PLUGIN_TARO_')
    const target = env.VITE_PLUGIN_TARO_TARGET as VitePluginTaroTarget

    return {
        base: target === 'h5' ? './' : undefined,
        plugins: [
            vitePluginTaro({
                target,
                app: 'src/app.ts',
                pages: [{ path: 'pages/index/index', config: {} }],
                appJson: {},
                projectConfigJson: {
                    appid: env.VITE_PLUGIN_TARO_WECHAT_APP_ID || 'touristappid'
                },
                sitemapJson: { rules: [{ action: 'allow', page: '*' }] }
            })
        ]
    }
})
```

Application code:

```ts
import { View, Text } from 'vite-plugin-taro/components'
import Taro from 'vite-plugin-taro/taro'

Taro.getWindowInfo()
```

## Conditional compilation

vite-plugin-taro strips inactive Taro-style conditional comment blocks before Vite parses source files. Supported files include TypeScript, JavaScript, JSX/TSX, CSS, Sass, Less, and Stylus.

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

Supported directives are `#ifdef`, `#ifndef`, `#if`, `#elif`, `#else`, and `#endif`. Expressions support simple target tokens with `!`, `&&`, and `||`.

## Target output

### `wx`

vite-plugin-taro configures Rolldown for WeChat-compatible CommonJS chunks and emits Mini Program assets including:

- `app.js`, `app.json`, `app.wxss`.
- Page `*.js`, `*.json`, `*.wxml`, and `*.wxss` files.
- Shared Taro recursive template assets: `base.wxml`, `comp.js`, `comp.json`, `comp.wxml`, `utils.wxs`.
- `project.config.json` and `sitemap.json`.

### `h5`

vite-plugin-taro injects a virtual module into `index.html`, creates Taro H5 route records from `pages`, and mounts the app with Taro's hash-history router.
