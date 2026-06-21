# vite-plugin-taro

[![npm version](https://img.shields.io/npm/v/vite-plugin-taro.svg)](https://www.npmjs.com/package/vite-plugin-taro)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[简体中文](README.md) | English

Build WeChat Mini Apps with the latest standard frontend stack: Vite 8, React 19, and Tailwind CSS v4.

`vite-plugin-taro` is for applications that want Taro's cross-platform React components and APIs, but prefer Vite/Rolldown instead of Taro's webpack runner. The plugin generates app/page entries, target runtime aliases, H5 router bootstrap, WeChat companion files, Tailwind processing, and conditional compilation for you.

Live demo: <https://sep2.github.io/vite-plugin-taro>. See [Sample app](packages/loan-genius/README.en.md) how to run it locally.

## Install

```sh
pnpm add -D vite-plugin-taro
```

Your app must also provide Vite 8, React 19, React DOM 19, TypeScript, and React type packages. If your app does not already have them, install the missing packages:

```sh
pnpm add react react-dom
pnpm add -D vite typescript @types/react @types/react-dom
```

You should NOT have direct dependencies on `@tarojs/*` packages anymore. Remove them if you have.

## Quick start

The examples below create this source shape:

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

You can also see a sample layout at [packages/loan-genius](https://github.com/sep2/vite-plugin-taro/tree/main/packages/loan-genius).

### 1. Add TypeScript declarations

Add the plugin client types to `tsconfig.json` so TypeScript knows about the virtual modules:

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

### 2. Configure Vite

Create `vite.config.ts` and choose the plugin target from an environment variable:

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

Important conventions:

- `target` must be `h5` or `wx` for each Vite run.
- `app` is the root React app component module. It should default-export the app component.
- Every `pages[].path` maps to a file at `src/${path}.tsx`. For example, `pages/index/index` requires `src/pages/index/index.tsx`.
- `appJson.pages` is generated from `pages`; any `pages` field you put in `appJson` is overwritten.
- The plugin does not read Taro CLI config files such as `config/index.ts`, `app.config.ts`, or page `config.ts` files. Pass app and page config through the plugin options.

### 3. Create the app component

`src/app.ts` is the shared application wrapper. It receives the current page as `children`.

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

Import global styles from the app component. They are included in H5 output and collected into `app.wxss` for WeChat builds.

### 4. Create a page component

`src/pages/index/index.tsx` is the React component for `pages/index/index`.

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

Use these imports in app code:

| Import | Use |
| --- | --- |
| `virtual:taro/components` | Taro React components such as `View`, `Text`, `Button`, `Image`, and `ScrollView`. |
| `virtual:taro/api` | Taro APIs and hooks such as `Taro.navigateTo`, `Taro.getWindowInfo`, and `Taro.useLaunch`. |

Do not import `@tarojs/*` packages directly in application code. Direct `@tarojs/*` usage is forbidden and unsupported by this plugin because it can bypass target-specific runtime aliases and H5 API transforms. Use `virtual:taro/api` and `virtual:taro/components` only.

### 5. Add the H5 HTML shell

For H5, keep a normal Vite `index.html` with an `#app` mount node. The plugin injects the generated Taro H5 entry automatically, so you do not need a normal Vite `src/main.tsx` script.

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

### 6. Add scripts

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

On Windows shells, use `cross-env`.

### 7. Run each target

```sh
pnpm dev:h5       # Start the H5 dev server
pnpm build:h5     # Build dist/h5
pnpm build:wx     # Build dist/wx
pnpm dev:wx       # Rebuild dist/wx in watch mode
```

Open the generated `dist/wx` directory in WeChat DevTools.

| Target | Meaning                                    | output dirs |
| --- |--------------------------------------------|-------------|
| `h5` | H5 production output.                      | `dist/h5`   |
| `wx` | WeChat Mini Program in both dev/prod mode. | `dist/wx`   |

## Options

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
| `target` | Active target for this Vite invocation. Use `h5` for Web and `wx` for WeChat Mini Program. |
| `app` | Source file that default-exports the root React app component, for example `src/app.ts` or `src/app.tsx`. |
| `pages` | Ordered page list. The order becomes `app.json.pages` and the H5 route order. |
| `pages[].path` | Taro-style route and output path without extension, for example `pages/index/index`. The page component must exist at `src/${path}.tsx`. |
| `pages[].config` | Page config merged into the generated WeChat page JSON and H5 route config. |
| `appJson` | Base app config. The plugin overwrites the `pages` field from `options.pages`. |
| `projectConfigJson` | WeChat `project.config.json` content emitted for `wx` builds. It is required by the option type even when the current target is `h5`. |
| `sitemapJson` | WeChat `sitemap.json` content emitted for `wx` builds. It is required by the option type even when the current target is `h5`. |

## Styling

You can use plain CSS, CSS modules, or Tailwind CSS v4.

For Tailwind CSS v4, import Tailwind from a global CSS file such as `src/app.css`:

```css
@import "tailwindcss/theme.css";
@import "tailwindcss/preflight.css";
@import "tailwindcss/utilities.css";

@source "./";
```

The plugin registers `@tailwindcss/vite` for `h5` builds and `weapp-tailwindcss` for `wx` builds. For `wx`, CSS emitted by Vite is collected into `app.wxss`, and page `.wxss` companion files are emitted for each page.

## Conditional compilation

The plugin strips inactive Taro-style conditional comment blocks before Vite parses source. This works in TypeScript, JavaScript, JSX/TSX, CSS, Sass, Less, and Stylus files outside `node_modules`.

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

Supported directives are `#ifdef`, `#ifndef`, `#if`, `#elif`, `#else`, and `#endif`. Conditions use the plugin target tokens `h5` and `wx`; `#if` expressions support `!`, `&&`, and `||`.

## Output by target

### H5

For `target: 'h5'`, the plugin injects a generated module into `index.html`, imports Taro's H5 component styles, builds route records from `pages`, and mounts the app with Taro's hash-history router. Routes use the page paths from your config, for example `#/pages/index/index`.

### WeChat Mini Program

For `target: 'wx'`, the plugin configures Vite/Rolldown to emit WeChat-compatible CommonJS chunks and Mini Program companion files.

Typical output:

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

Open `dist/wx` with WeChat DevTools; do not open the source project directory.

## Migrating from Taro

You can keep most React page components, business logic, assets, and styles, but the build entry moves from Taro CLI config to Vite config.

Migration checklist:

1. Install `vite-plugin-taro` and create `vite.config.ts` with `vitePluginTaro(...)`.
2. Move app config and page config into the plugin options. The plugin does not read Taro CLI files such as `config/index.ts`, `app.config.ts`, or page `config.ts` files.
3. Register every page in `pages`. Each page path must match `src/${path}.tsx`.
4. Replace Taro scripts with Vite scripts that set `VITE_PLUGIN_TARO_TARGET=h5` or `VITE_PLUGIN_TARO_TARGET=wx`.
5. For H5, add a normal Vite `index.html` with `<div id="app"></div>` and no separate `src/main.tsx` entry.
6. Replace application imports from `@tarojs/*` with the plugin virtual modules.

Before:

```tsx
import Taro from '@tarojs/taro'
import { Text, View } from '@tarojs/components'
```

After:

```tsx
import Taro from 'virtual:taro/api'
import { Text, View } from 'virtual:taro/components'
```

Direct `@tarojs/*` imports in application code are forbidden. Let the plugin own Taro runtime resolution so H5 and WeChat builds receive the correct target-specific aliases.

## Sample app

The sample app lives in [`packages/loan-genius`](https://github.com/sep2/vite-plugin-taro/tree/main/packages/loan-genius). It demonstrates the page convention, target selection, H5 routing, Tailwind styling, and WeChat output.

```sh
git clone https://github.com/sep2/vite-plugin-taro.git

# Install dependencies
pnpm install

# Run once, it generates the patched Taro packages
pnpm prepare:taro

# Build the plugin for sample app to use
pnpm build:plugin

# Run the sample app in H5 in Dev mode
pnpm dev:sample:h5

# Build the sample app to H5 output and preview it
pnpm build:sample:h5
pnpm preview:sample:h5

# Run the sample app in WeChat
pnpm dev:sample:wx

# Build the sample app to WeChat output
pnpm build:sample:wx
```

Open `packages/loan-genius/dist/wx` with WeChat DevTools to test the Mini Program output.


## Develop this repository

```sh
pnpm install
pnpm prepare:taro
pnpm build:plugin
pnpm typecheck
```

Common scripts:

| Script | Description |
| --- | --- |
| `pnpm prepare:taro` | Regenerate the patched React 19 Taro packages from upstream npm tarballs and local patch files. |
| `pnpm build:plugin` | Build `packages/vite-plugin-taro` into `dist`. |
| `pnpm typecheck` | Typecheck the plugin and sample app with `tsgo`. |
| `pnpm lint` | Run Biome checks. |
| `pnpm format` | Apply Biome formatting. |
| `pnpm dev:sample:h5` | Start the sample H5 app in Vite dev mode. Build the plugin first. |
| `pnpm dev:sample:wx` | Build the sample WeChat Mini Program in watch mode. Build the plugin first. |
| `pnpm build:sample:h5` | Build the sample H5 app to `packages/loan-genius/dist/h5`. |
| `pnpm preview:sample:h5` | Preview the built H5 sample. |
| `pnpm build:sample:wx` | Build the sample WeChat Mini Program to `packages/loan-genius/dist/wx`. |
| `pnpm publish:dry` | Dry-run package validation and publishing. |
| `pnpm publish:all` | Publish the public packages in dependency order. |

## Limitations

- Only `h5` and `wx` targets are generated today.
- Application code must not import `@tarojs/*` packages directly.


## Troubleshooting

| Problem | Check |
| --- | --- |
| `VITE_PLUGIN_TARO_TARGET must be "h5" or "wx"` | Set the target environment variable in your script or `.env` file. |
| A page cannot be resolved | Confirm that `pages[].path` has a matching `src/${path}.tsx` file. |
| H5 shows a blank page | Keep `<div id="app"></div>` in `index.html`, register the plugin, and avoid adding a separate default Vite `main.tsx` entry. |
| Taro APIs are missing or behave differently | Remove direct `@tarojs/*` imports from application code and import Taro from `virtual:taro/api`. |
| Components render without expected styles on H5 | Import components from `virtual:taro/components` and keep the plugin enabled for the `h5` target. |
| WeChat DevTools cannot open the app | Open the generated `dist/wx` folder and check `projectConfigJson.appid`. |
| Tailwind classes do not appear | Ensure your global CSS imports Tailwind and includes an `@source` path that covers your source files. |

## Release workflow

Validate the publishable packages before publishing:

```sh
pnpm publish:dry
```

Publish all public packages in the required order:

```sh
pnpm publish:all
```


## License

MIT
