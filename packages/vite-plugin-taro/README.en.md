# vite-plugin-taro

[![npm version](https://img.shields.io/npm/v/vite-plugin-taro.svg)](https://www.npmjs.com/package/vite-plugin-taro)
![Vite compatibility](https://registry.vite.dev/api/badges?package=vite-plugin-taro&tool=vite)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[简体中文](README.md) | English

Build WeChat Mini Apps with the latest standards-based frontend stack: Vite 8, React 19, and Tailwind CSS v4.

`vite-plugin-taro` is for applications that want Taro's cross-platform React components and APIs, but prefer Vite instead of Taro webpack. You only need this plugin to build a complete WeChat Mini Program.

Live demo: <https://sep2.github.io/vite-plugin-taro>. See [Sample app](https://github.com/sep2/vite-plugin-taro/tree/main/packages/loan-genius/README.en.md) how to run it locally.

- **Native Vite builds** Use standard Vite 8 config instead of legacy webpack configuration, with support for all Vite plugins.
- **Hot reload** Both WeChat Mini Program and H5 support dev-mode watch, with Vite 8 HMR/rebuilds for fast feedback.
- **Battle-tested Taro foundation** Use the full set of Taro APIs and components instead of reinventing cross-platform primitives.
- **Tailwind ready** Built-in Tailwind CSS v4 support for both WeChat Mini Program and H5 styles.
- **Conditional compilation** Use Taro-style `#ifdef` / `#ifndef` / `#if` blocks to split code and styles by WeChat / web target.
- **Workspace friendly** Supports standalone apps and monorepos, with npm, pnpm, Yarn, Bun, and other package managers.
- **Type-friendly** The project supports TypeScript all the way.
- **WeChat Skyline** Support WeChat Mini Program output with Skyline rendering mode.

## Quick start

Use `create-vite-taro` for new apps. It scaffolds a Vite 8 + React 19 + Tailwind CSS v4 + Taro 4 project.

### 1. Create and install

```sh
# Create a new app from the default template
npm create vite-taro@latest my-app

# Enter the project and install dependencies
cd my-app
npm install
```

### 2. Configure WeChat Mini Program App ID

The template creates `.env.local`. Set `VITE_PLUGIN_TARO_WECHAT_APP_ID` to your WeChat Mini Program App ID.

### 3. Run in development

```sh
# WeChat Mini Program: rebuild dist/wx in watch mode
npm run dev:wx

# Then open dist/wx in WeChat DevTools

# H5: start the Vite dev server
npm run dev:h5

# Then open the standard Vite dev URL in your browser
# http://localhost:5173
```

You can keep `npm run dev:wx` and `npm run dev:h5` running at the same time in separate terminals.

Note: Because of WeChat DevTools and Mini Program runtime limitations, hot reload/fast rebuilds for the WeChat target may not always apply cleanly. For day-to-day iteration, prefer the H5 Vite dev server for fast feedback, and periodically verify the Mini Program result in WeChat DevTools.

### 4. Build, preview, and typecheck

```sh
# Production WeChat Mini Program output
npm run build:wx

# Production H5 output
npm run build:h5

# Preview the built H5 app
npm run preview:h5

# Typecheck with tsgo
npm run typecheck
```

### 5. Use Taro virtual modules

Use these imports in app code:

```tsx
import Taro from 'virtual:taro/api'
import { Text, View } from 'virtual:taro/components'
```

| Import | Use |
| --- | --- |
| `virtual:taro/components` | Taro React components such as `View`, `Text`, `Button`, `Image`, and `ScrollView`. |
| `virtual:taro/api` | Taro APIs and hooks such as `Taro.navigateTo`, `Taro.getWindowInfo`, and `Taro.useLaunch`. |

Usage is the same as Taro itself; see the [Taro website](https://docs.taro.zone) for component and API details.

You no longer need to install `@tarojs/*` packages; application code should not import from `@tarojs/*`.


## Manual setup for existing apps

For existing apps or custom project layouts, follow the steps below to wire the plugin manually. First, install the plugin:

```sh
npm install -D vite-plugin-taro
```

Your app must also provide Vite 8, React 19, React DOM 19, a TypeScript checker, and Node/React type packages. If your app does not already have them, install the missing packages:

```sh
npm install react react-dom
npm install -D vite @typescript/native-preview @types/node @types/react @types/react-dom
```

You should NOT have direct dependencies on `@tarojs/*` packages anymore. Remove them if you have.

The steps below create this source shape:

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
    if (target === 'wx' || target === 'h5') return target
    throw new Error(`${targetEnvName} must be "wx" or "h5".`)
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

- `target` must be `wx` or `h5` for each Vite run.
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

Import global styles from the app component. They are collected into `app.wxss` for WeChat builds and included in H5 output.

### 4. Create a page component

`src/pages/index/index.tsx` is the React component for `pages/index/index`.

```tsx
import Taro from 'virtual:taro/api'
import { Button, Text, View } from 'virtual:taro/components'

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

Use the same scripts generated by `create-vite-taro`:

```json
{
    "scripts": {
        "dev:wx": "NODE_ENV=development VITE_PLUGIN_TARO_TARGET=wx vite build --watch",
        "dev:h5": "NODE_ENV=development VITE_PLUGIN_TARO_TARGET=h5 vite",
        "build:wx": "NODE_ENV=production VITE_PLUGIN_TARO_TARGET=wx vite build",
        "build:h5": "NODE_ENV=production VITE_PLUGIN_TARO_TARGET=h5 vite build",
        "preview:h5": "NODE_ENV=production VITE_PLUGIN_TARO_TARGET=h5 vite preview --outDir dist/h5",
        "typecheck": "tsgo -b"
    }
}
```

On Windows shells, use `cross-env`.

### 7. Run each target

```sh
npm run dev:wx       # Rebuild dist/wx in watch mode
npm run dev:h5       # Start the H5 dev server
npm run build:wx     # Build dist/wx
npm run build:h5     # Build dist/h5
npm run preview:h5   # Preview dist/h5
npm run typecheck    # Typecheck with tsgo
```

Open the generated `dist/wx` directory in WeChat DevTools.

| Target | Meaning | Output dir |
| --- | --- | --- |
| `wx` | WeChat Mini Program in both dev/prod mode. | `dist/wx` |
| `h5` | H5 production output. | `dist/h5` |

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
| `target` | Active target for this Vite invocation. Use `wx` for WeChat Mini Program and `h5` for Web. |
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

The plugin registers `weapp-tailwindcss` for `wx` builds and `@tailwindcss/vite` for `h5` builds. For `wx`, CSS emitted by Vite is collected into `app.wxss`, and page `.wxss` companion files are emitted for each page.

## Conditional compilation

The plugin strips inactive Taro-style conditional comment blocks before Vite parses source. This works in TypeScript, JavaScript, JSX/TSX, CSS, Sass, Less, and Stylus files outside `node_modules`.

```ts
// #ifdef wx
console.log('WeChat only')
// #endif

// #ifdef h5
console.log('H5 only')
// #endif

// #if wx && !h5
console.log('WeChat expression')
// #elif h5
console.log('H5 expression')
// #else
console.log('fallback')
// #endif
```

Supported directives are `#ifdef`, `#ifndef`, `#if`, `#elif`, `#else`, and `#endif`. Conditions use the plugin target tokens `wx` and `h5`; `#if` expressions support `!`, `&&`, and `||`.

## Output by target

### WeChat Mini Program

For `target: 'wx'`, the plugin configures Vite to emit WeChat-compatible CommonJS chunks and Mini Program companion files.

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

### H5

For `target: 'h5'`, the plugin injects a generated module into `index.html`, imports Taro's H5 component styles, builds route records from `pages`, and mounts the app with Taro's hash-history router. Routes use the page paths from your config, for example `#/pages/index/index`.

## Migrating from Taro

You can keep most React page components, business logic, assets, and styles, but the build entry moves from Taro CLI config to Vite config.

Migration checklist:

1. Install `vite-plugin-taro` and create `vite.config.ts` with `vitePluginTaro(...)`.
2. Move app config and page config into the plugin options. The plugin does not read Taro CLI files such as `config/index.ts`, `app.config.ts`, or page `config.ts` files.
3. Register every page in `pages`. Each page path must match `src/${path}.tsx`.
4. Replace Taro scripts with Vite scripts that set `VITE_PLUGIN_TARO_TARGET=wx` or `VITE_PLUGIN_TARO_TARGET=h5`.
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

Direct `@tarojs/*` imports in application code are forbidden. Let the plugin own Taro runtime resolution so WeChat and H5 builds receive the correct target-specific aliases.

## Sample app

The sample app lives in [`packages/loan-genius`](https://github.com/sep2/vite-plugin-taro/tree/main/packages/loan-genius). It demonstrates the page convention, target selection, WeChat output, H5 routing, and Tailwind styling.

```sh
git clone https://github.com/sep2/vite-plugin-taro.git

# Install dependencies
pnpm install

# Run once, it generates the patched Taro packages
pnpm prepare:taro

# Build the plugin for sample app to use
pnpm build:plugin

# Run the sample app in WeChat
pnpm dev:sample:wx

# Build the sample app to WeChat output
pnpm build:sample:wx

# Run the sample app in H5 dev mode
pnpm dev:sample:h5

# Build the sample app to H5 output and preview it
pnpm build:sample:h5
pnpm preview:sample:h5
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
| `pnpm dev:sample:wx` | Build the sample WeChat Mini Program in watch mode. Build the plugin first. |
| `pnpm dev:sample:h5` | Start the sample H5 app in Vite dev mode. Build the plugin first. |
| `pnpm build:sample:wx` | Build the WeChat Mini Program sample to `packages/loan-genius/dist/wx`. |
| `pnpm build:sample:h5` | Build the H5 sample app to `packages/loan-genius/dist/h5`. |
| `pnpm preview:sample:h5` | Preview the built H5 sample. |
| `pnpm publish:dry` | Dry-run package validation and publishing. |
| `pnpm release <version\|bump>` | Validate, bump versions, create the release commit and tag, and push to trigger CI publishing. |
| `pnpm publish:all` | Publish the public packages in dependency order; mainly used by the tag-based Trusted Publishing workflow. |

## Limitations

- Only `wx` and `h5` targets are generated today.
- Application code must not import `@tarojs/*` packages directly.

## Troubleshooting

| Problem | Check |
| --- | --- |
| `VITE_PLUGIN_TARO_TARGET must be "wx" or "h5"` | Set the target environment variable in your script or `.env` file. |
| `pnpm install` says dependency build scripts were ignored | Run `pnpm approve-builds` and approve the requested dependency build scripts. |
| A page cannot be resolved | Confirm that `pages[].path` has a matching `src/${path}.tsx` file. |
| WeChat DevTools cannot open the app | Open the generated `dist/wx` folder and check `projectConfigJson.appid`. |
| H5 shows a blank page | Keep `<div id="app"></div>` in `index.html`, register the plugin, and avoid adding a separate default Vite `main.tsx` entry. |
| Taro APIs are missing or behave differently | Remove direct `@tarojs/*` imports from application code and import Taro from `virtual:taro/api`. |
| Components render without expected styles on H5 | Import components from `virtual:taro/components` and keep the plugin enabled for the `h5` target. |
| Tailwind classes do not appear | Ensure your global CSS imports Tailwind and includes an `@source` path that covers your source files. |

## Release workflow

This repository publishes automatically with npm Trusted Publishing and GitHub Actions. Normal pushes to `main` do not publish; only tags matching `v*.*.*` trigger `.github/workflows/publish.yml`.

Create a release:

```sh
pnpm release patch
```

`pnpm release` requires a clean `main` working tree, runs `pnpm version:bump`, validates with `pnpm publish:dry -- --no-git-check`, creates the `chore: release vX.Y.Z` commit and `vX.Y.Z` tag, then pushes the branch and tag to trigger CI. You can also release an exact version or prerelease:

```sh
pnpm release 0.2.0
pnpm release prerelease --preid beta
pnpm release patch --dry-run
pnpm release patch --no-push
```

CI runs `pnpm publish:all -- --no-git-check`, packs packages in dependency order, and publishes public packages through npm OIDC. Do not configure `NPM_TOKEN` for the publish workflow; each npm package's Trusted Publisher should point to `publish.yml`.

## License

MIT
