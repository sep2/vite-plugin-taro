# vite-plugin-taro

Vite 8 + React 19 plugin for building one React/Taro codebase for both WeChat Mini Program (`wx`) and Web (`h5`) targets.

- npm: [`vite-plugin-taro`](https://www.npmjs.com/package/vite-plugin-taro)
- Sample H5 demo: <https://sep2.github.io/vite-plugin-taro/>
- Repository: <https://github.com/sep2/vite-plugin-taro>

## Features

- Build the same React/Taro app as either:
  - `wx`: WeChat Mini Program assets.
  - `h5`: Web app powered by the Taro H5 runtime/router.
- React 19 support out of the box.
- No app-side Taro runtime patching required.
- Taro-style conditional compilation comments before Vite parses source.
- Vite/Rolldown output setup for target-specific generated app/page entries.
- Tailwind CSS and WeChat output integration.

## Repository layout

| Package | Purpose |
| --- | --- |
| [`vite-plugin-taro`](packages/vite-plugin-taro) | Published Vite plugin. |
| [`loan-genius`](packages/loan-genius) | Sample mortgage/loan calculator app, forked/adapted from [`wuba/Taro-Mortgage-Calculator`](https://github.com/wuba/Taro-Mortgage-Calculator), used to verify H5 and WeChat builds. |

## Install

```sh
pnpm add -D vite-plugin-taro vite
pnpm add react react-dom
```

## Basic Vite config

```ts
import taro, { type TaroTarget } from 'vite-plugin-taro/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'VITE_PLUGIN_TARO_')
    const target = env.VITE_PLUGIN_TARO_TARGET as TaroTarget

    return {
        base: target === 'h5' ? './' : undefined,
        plugins: [
            taro({
                target,
                app: 'src/app.ts',
                pages: [{ path: 'pages/index/index', config: {} }],
                appJson: {},
                projectConfigJson: { appid: env.VITE_PLUGIN_TARO_WECHAT_APP_ID || 'touristappid' },
                sitemapJson: { rules: [{ action: 'allow', page: '*' }] }
            })
        ]
    }
})
```

Application code should import Taro APIs/components through the plugin facades:

```ts
import Taro from 'vite-plugin-taro/taro'
import { View, Text } from 'vite-plugin-taro/components'
```

## Development

```sh
pnpm install
pnpm prepare:taro
pnpm typecheck
pnpm build:sample:h5
pnpm build:sample:wx
```

Useful scripts:

| Script | Description |
| --- | --- |
| `pnpm prepare:taro` | Prepare workspace Taro runtime dependencies. |
| `pnpm build:plugin` | Build `vite-plugin-taro`. |
| `pnpm build:sample:h5` | Build the sample H5 app to `packages/loan-genius/dist/h5`. |
| `pnpm build:sample:wx` | Build the sample WeChat Mini Program to `packages/loan-genius/dist/wx`. |
| `pnpm publish:dry` | Dry-run publishing all public packages in order. |
| `pnpm publish:all` | Publish the public packages in the required order. |

## GitHub Pages sample

The sample H5 app is deployed by `.github/workflows/pages.yml` on every push to `main`.

Manual local build:

```sh
pnpm build:sample:h5
```

Enable Pages in the GitHub repository settings with **Source: GitHub Actions**.

## Publishing

Use the one-command release script:

```sh
pnpm publish:all
```

For npm accounts with 2FA:

```sh
pnpm publish:all -- --otp 123456
```

Dry run:

```sh
pnpm publish:dry
```

## License

MIT.
