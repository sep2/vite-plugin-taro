# vite-plugin-taro

[![npm version](https://img.shields.io/npm/v/vite-plugin-taro.svg)](https://www.npmjs.com/package/vite-plugin-taro)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Build one React 19 + Taro 4 codebase with Vite 8 for both Web (`h5`) and WeChat Mini Program (`wx`) targets.

- npm: [`vite-plugin-taro`](https://www.npmjs.com/package/vite-plugin-taro)
- H5 sample: <https://sep2.github.io/vite-plugin-taro/>
- Issues: <https://github.com/sep2/vite-plugin-taro/issues>

## Why this exists

Taro already provides the cross-platform runtime and component model. This project adds a Vite-first build layer for React 19 apps that need the same source tree to produce:

| Target | Output |
| --- | --- |
| `h5` | A Web app powered by Taro's H5 runtime and hash router. |
| `wx` | WeChat Mini Program assets that can be opened in WeChat DevTools. |

The plugin generates the app/page entries normally produced by Taro's webpack runner, configures Vite/Rolldown for each target, and exposes stable app-facing import paths.

## Packages

| Package | Purpose | Published |
| --- | --- | --- |
| [`packages/vite-plugin-taro`](packages/vite-plugin-taro) | Public Vite plugin and app-facing Taro facades. | `vite-plugin-taro` |
| [`packages/taro-react`](packages/taro-react) | Generated React 19-compatible build of `@tarojs/react@4.2.0`. | `vite-plugin-taro-react` |
| [`packages/taro-plugin-framework-react`](packages/taro-plugin-framework-react) | Generated React 19-compatible build of `@tarojs/plugin-framework-react@4.2.0`. | `vite-plugin-taro-plugin-framework-react` |
| [`packages/loan-genius`](packages/loan-genius) | Sample loan calculator app used to verify `h5` and `wx` builds. | Private sample |

## Features

- One React/Taro source tree for `h5` and `wx` builds.
- React 19 support through patched Taro React runtime packages.
- Vite 8 plugin API with target-specific Vite/Rolldown configuration.
- Generated Taro-style app and page entries for both targets.
- WeChat Mini Program asset emission: JSON, WXML, WXS, WXSS, and CommonJS chunks.
- H5 runtime bootstrapping with Taro's router and component styles.
- Taro-style conditional compilation comments before Vite parses source.
- Tailwind CSS v4 integration for H5 and WeChat-compatible Tailwind processing for Mini Programs.
- App-facing facades for Taro APIs and components so application code does not depend on target internals.

## Requirements

| Tool | Version |
| --- | --- |
| Node.js | `^20.19.0` or `>=22.12.0` for the published plugin; this repository is developed with Node.js 26+. |
| pnpm | `11.x` for the monorepo. |
| Vite | `^8.0.0` peer dependency. |
| React / React DOM | `^19.0.0` peer dependencies. |
| WeChat DevTools | Required only for testing the `wx` output. |

## Install in an app

```sh
pnpm add -D vite vite-plugin-taro
pnpm add react react-dom
```

Create a Vite config that selects a target and passes the app/page metadata to the plugin:

```ts
import { defineConfig, loadEnv } from 'vite'
import vitePluginTaro, { type VitePluginTaroTarget } from 'vite-plugin-taro/vite'

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

Application code should import Taro APIs and components through the package facades:

```tsx
import { Text, View } from 'vite-plugin-taro/components'
import Taro from 'vite-plugin-taro/taro'

export default function Page() {
    Taro.getWindowInfo()

    return (
        <View>
            <Text>Hello Taro</Text>
        </View>
    )
}
```

See the full plugin API in [`packages/vite-plugin-taro/README.md`](packages/vite-plugin-taro/README.md).

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

## Sample app

The sample app lives in [`packages/loan-genius`](packages/loan-genius). It demonstrates the page convention, target selection, H5 routing, and WeChat output.

```sh
pnpm build:plugin
pnpm dev:sample:h5
pnpm build:sample:wx
```

Open `packages/loan-genius/dist/wx` with WeChat DevTools to test the Mini Program output.

## Release workflow

Validate the publishable packages before publishing:

```sh
pnpm publish:dry
```

Publish all public packages in the required order:

```sh
pnpm publish:all
```

For npm accounts with 2FA:

```sh
pnpm publish:all -- --otp 123456
```

## Project status

This is an early `0.x` package. The plugin API is intentionally small, but breaking changes can still happen before a stable `1.0` release.

## License

MIT. See [`LICENSE`](LICENSE).
