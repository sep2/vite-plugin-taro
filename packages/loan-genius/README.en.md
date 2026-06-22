# Loan Genius

[简体中文](README.zh.md) | English

Loan Genius is the sample app for `vite-plugin-taro`. It is a React 19 + Taro loan calculator built with the same latest standard frontend stack promoted by this repository: Vite 8, React 19, and Tailwind CSS v4.

The app is forked from [`wuba/Taro-Mortgage-Calculator`](https://github.com/wuba/Taro-Mortgage-Calculator) and adapted to demonstrate `vite-plugin-taro`.

- Source: [`packages/loan-genius`](https://github.com/sep2/vite-plugin-taro/tree/main/packages/loan-genius)
- Live H5 demo: <https://sep2.github.io/vite-plugin-taro/>

## Requirements

| Tool | Version / use |
| --- | --- |
| Node.js | `>=22` |
| pnpm | `11.x` |
| WeChat DevTools | Needed only for opening `dist/wx`. |

## Run from a fresh clone

Run these commands from the repository root:

```sh
pnpm install
pnpm prepare:taro
pnpm build:plugin
```

`pnpm prepare:taro` is required in a fresh clone because the patched Taro workspace package outputs are generated files and are not committed.

## WeChat Mini Program

Build the WeChat Mini Program once:

```sh
pnpm build:sample:wx
```

Or rebuild it in watch mode:

```sh
pnpm dev:sample:wx
```

WeChat output is written to:

```text
packages/loan-genius/dist/wx
```

Open `packages/loan-genius/dist/wx` in WeChat DevTools. Do not open the source package directory.

## H5

Start the H5 dev server:

```sh
pnpm dev:sample:h5
```

Build and preview the H5 app:

```sh
pnpm build:sample:h5
pnpm preview:sample:h5
```

H5 output is written to:

```text
packages/loan-genius/dist/h5
```

## What this sample demonstrates

- One React 19 + Taro source tree for both `wx` and `h5`.
- `vite-plugin-taro` target selection with `VITE_PLUGIN_TARO_TARGET`.
- App and page metadata declared in `vite.config.ts`.
- WeChat Mini Program build output, H5 dev server, and H5 build output.
- Tailwind CSS v4 imported from `src/app.css`.
- App-facing imports from `virtual:taro/api` and `virtual:taro/components`.
- WeChat `project.config.json`, `sitemap.json`, WXML, WXS, WXSS, and CommonJS chunk emission.

Application code must not import or install `@tarojs/*` packages directly. Use the plugin virtual modules instead:

```tsx
import Taro from 'virtual:taro/api'
import { Text, View } from 'virtual:taro/components'
```

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_PLUGIN_TARO_TARGET` | Yes | Set by the root scripts to `wx` or `h5`. |
| `VITE_PLUGIN_TARO_WECHAT_APP_ID` | No | WeChat Mini Program app id. Defaults to `touristappid`. |

For local WeChat testing, put your app id in `packages/loan-genius/.env.local`:

```env
VITE_PLUGIN_TARO_WECHAT_APP_ID=your_app_id
```

## Project structure

```text
packages/loan-genius/
├── index.html
├── vite.config.ts
└── src/
    ├── app.ts
    ├── app.css
    ├── components/
    ├── pages/
    │   └── calculator/
    └── utils/
```

Important files:

| File | Purpose |
| --- | --- |
| `vite.config.ts` | Selects the target, configures aliases, output directory, pages, app config, and WeChat project metadata. |
| `src/app.ts` | Root React app component passed to `vite-plugin-taro`. |
| `src/app.css` | Global Tailwind CSS v4 imports and app styles. |
| `src/pages/calculator/index.tsx` | First page and default route. |
| `src/pages/calculator/monthly-payments/index.tsx` | Monthly payment detail page. |
| `src/pages/calculator/history/index.tsx` | Calculator history page. |

## Adding a page

1. Create a page component under `src/pages`, for example `src/pages/about/index.tsx`.
2. Add the route to `pages` in `vite.config.ts`:

```ts
{
    path: 'pages/about/index',
    config: {
        navigationBarTitleText: 'About'
    }
}
```

3. Import Taro APIs and components through the plugin virtual modules:

```tsx
import Taro from 'virtual:taro/api'
import { Text, View } from 'virtual:taro/components'
```

## License

MIT
