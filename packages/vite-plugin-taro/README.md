# vite-plugin-taro

Vite 8 + React 19 plugin for building one React/Taro codebase for both WeChat Mini Program (`wx`) and Web (`h5`) targets.

- npm: <https://www.npmjs.com/package/vite-plugin-taro>
- Sample H5 demo: <https://sep2.github.io/vite-plugin-taro/>
- Repository: <https://github.com/sep2/vite-plugin-taro>

## Features

- `wx` target: emits WeChat Mini Program JS/JSON/WXML/WXSS assets.
- `h5` target: emits a Web app using the Taro H5 runtime and router.
- React 19 support via patched Taro runtime packages published as npm aliases.
- No app-side `patchedDependencies` required.
- Taro-style conditional compilation comments for TS/JS/JSX/TSX and style files.
- Target-specific Vite/Rolldown and WeChat output setup.

## Install

```sh
pnpm add -D vite-plugin-taro vite
pnpm add react react-dom
```

## Vite usage

```ts
import taro from 'vite-plugin-taro/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'VITE_PLUGIN_TARO_')
    const target = env.VITE_PLUGIN_TARO_TARGET as 'wx' | 'h5'

    return {
        base: target === 'h5' ? './' : undefined,
        plugins: [
            taro({
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

Example scripts:

```json
{
    "scripts": {
        "build:h5": "NODE_ENV=production VITE_PLUGIN_TARO_TARGET=h5 vite build",
        "build:wx": "NODE_ENV=production VITE_PLUGIN_TARO_TARGET=wx vite build",
        "dev:h5": "NODE_ENV=development VITE_PLUGIN_TARO_TARGET=h5 vite",
        "dev:wx": "NODE_ENV=development VITE_PLUGIN_TARO_TARGET=wx vite build --watch"
    }
}
```

Application code should usually import only from the plugin virtual modules. `virtual:taro` is default-export only; call APIs as `Taro.xxx`.

```ts
import Taro from 'virtual:taro'
import { Text, View } from 'virtual:taro/components'

Taro.useLaunch(() => {})
Taro.getWindowInfo()
```

For Taro namespace types:

```ts
import type Taro from 'virtual:taro'

type Color = Taro.Color
```

Add the virtual module declarations to the app `tsconfig.json`:

```json
{
    "compilerOptions": {
        "types": ["vite/client", "vite-plugin-taro/client"]
    }
}
```

## Styling

`vite-plugin-taro` does not bundle a Tailwind or `weapp-tailwindcss` pipeline. Add styling plugins directly in the app's Vite config when needed. See [`loan-genius`](../loan-genius) for an example using Tailwind v4 and `weapp-tailwindcss`.

## Options

```ts
type TaroTarget = 'wx' | 'h5'

type TaroPageOption = {
    path: string
    config: Record<string, unknown>
}

interface TaroPluginOptions {
    target: TaroTarget
    app: string
    pages: TaroPageOption[]
    appJson: Record<string, unknown>
    projectConfigJson: Record<string, unknown>
    sitemapJson: Record<string, unknown>
}
```

| Option | Description |
| --- | --- |
| `target` | Active build target: `wx` or `h5`. |
| `app` | Source file that default-exports the root React app component. |
| `pages` | Ordered page list. Also becomes `app.json.pages` and H5 route order. |
| `appJson` | Base `app.json` content. `pages` is overwritten from `pages`. |
| `projectConfigJson` | `project.config.json` emitted for WeChat builds. |
| `sitemapJson` | `sitemap.json` emitted for WeChat builds. |

## App virtual modules

| Import | Purpose |
| --- | --- |
| `virtual:taro` | Default-only Taro API facade. Use this instead of importing `@tarojs/taro` directly. |
| `virtual:taro/components` | Re-export of `@tarojs/components`. Use this in app code. |

## Package exports

| Import | Purpose |
| --- | --- |
| `vite-plugin-taro` | Default Vite plugin entry. |
| `vite-plugin-taro/vite` | Default Vite plugin entry. |
| `vite-plugin-taro/client` | Type declarations for `virtual:taro` and `virtual:taro/components`. |
| `vite-plugin-taro/shim/h5` | H5 runtime shim used by generated entries. |
| `vite-plugin-taro/shim/wx` | WeChat runtime shim used by generated entries. |

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

For GitHub Pages or any subpath deployment, set a relative/base path in Vite, for example:

```ts
export default defineConfig({
    base: './'
})
```

## React 19 compatibility

Taro 4.2's official React runtime targets React 18. vite-plugin-taro depends on two small React 19-compatible runtime packages generated from the official Taro npm tarballs plus local patch files:

- `vite-plugin-taro-react`
- `vite-plugin-taro-plugin-framework-react`

When packed/published by pnpm, workspace aliases become npm aliases to these patched packages:

```json
{
    "@tarojs/react": "npm:vite-plugin-taro-react@4.2.0-react19.1",
    "@tarojs/plugin-framework-react": "npm:vite-plugin-taro-plugin-framework-react@4.2.0-react19.1"
}
```

That means app users get React 19-compatible Taro runtime packages automatically and do not need local patches.

## Publishing from this repository

```sh
pnpm install
pnpm publish:dry
pnpm publish:all

# If npm 2FA is enabled:
pnpm publish:all -- --otp 123456
```

The package publishes built ESM JavaScript and `.d.ts` files from `dist`.

## License

MIT.
