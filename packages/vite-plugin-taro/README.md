# vite-plugin-taro

Vite 8 + React 19 plugin for building one React/Taro codebase for both:

- `wx`: WeChat Mini Program output.
- `h5`: Web output powered by Taro H5 runtime and router.

It wraps React 19-compatible Taro runtime packages, emits the generated app/page entries that Taro normally creates, and configures Vite/Rolldown, Tailwind CSS, and target-specific aliases for the selected target.

## Install

```sh
pnpm add -D vite-plugin-taro vite
pnpm add react react-dom
```

## Vite usage

```ts
import taro, { type TaroTarget } from 'vite-plugin-taro/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'VITE_PLUGIN_TARO_')
    const target = env.VITE_PLUGIN_TARO_TARGET as TaroTarget

    return {
        plugins: [
            taro({
                target,
                app: 'src/app.ts',
                pages: [{ path: 'pages/index/index', config: {} }],
                appJson: {},
                projectConfigJson: { appid: 'touristappid' },
                sitemapJson: { rules: [{ action: 'allow', page: '*' }] }
            })
        ]
    }
})
```

Application code should usually import only `vite-plugin-taro/components` and `vite-plugin-taro/taro`.

## Package exports

| Import | Purpose |
| --- | --- |
| `vite-plugin-taro` | Default Vite plugin and public plugin types. |
| `vite-plugin-taro/vite` | Default Vite plugin and `TaroTarget`, `TaroPluginOptions`, `TaroPageOption` types. |
| `vite-plugin-taro/components` | Re-export of `@tarojs/components`. Use this in app code. |
| `vite-plugin-taro/taro` | Taro API facade. Use this instead of importing `@tarojs/taro` directly. |
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

## React 19 compatibility

Taro 4.2's official React runtime targets React 18. vite-plugin-taro depends on two small React 19-compatible runtime packages generated from the official Taro npm tarballs plus vite-plugin-taro's local patch files:

- `vite-plugin-taro-react`
- `vite-plugin-taro-plugin-framework-react`

In the workspace these are referenced with pnpm workspace aliases:

```json
{
    "@tarojs/react": "workspace:vite-plugin-taro-react@*",
    "@tarojs/plugin-framework-react": "workspace:vite-plugin-taro-plugin-framework-react@*"
}
```

When packed/published by pnpm, those become npm aliases to the published patched packages. vite-plugin-taro source can keep importing the upstream Taro specifiers while users receive the patched React 19-compatible packages automatically.

Run `pnpm prepare:taro` to regenerate the patched packages from upstream tarballs. Publish those runtime packages before publishing `vite-plugin-taro`.

## Publishing

```sh
pnpm install
pnpm publish:dry
pnpm publish:all

# If npm 2FA is enabled:
pnpm publish:all -- --otp 123456
```

The package publishes built ESM JavaScript and `.d.ts` files from `dist`.
