# Loan Genius

[简体中文](README.zh.md) | English

Loan Genius is the sample app for `vite-plugin-taro`. It is a React 19 + Taro loan calculator built with the same latest standard frontend stack promoted by this repository: Vite 8, React 19, and Tailwind CSS v4.

> **AI-assisted development is recommended:** Follow the [VPT AI development guide](https://vpt.js.org/guides/ai/) and let a coding assistant create, develop, test, and validate your app.

The app is forked from [`wuba/Taro-Mortgage-Calculator`](https://github.com/wuba/Taro-Mortgage-Calculator) and adapted to demonstrate `vite-plugin-taro`.

- Source: [`demo/loan-genius`](https://github.com/sep2/vite-plugin-taro/tree/main/demo/loan-genius)
- Official Website: <https://vpt.js.org>

## Requirements

| Tool | Version / use |
| --- | --- |
| Node.js | `>=22` |
| pnpm | `11.x` |
| WeChat DevTools | Needed for opening `dist/wx` and running WX HMR tests. |
| Alipay Mini Program Studio | Needed for opening `dist/zfb`. |
| TikTok DevTools | Needed for opening `dist/tt`. |
| `wechatide` | Needed only for the automated WX HMR suite. |

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
pnpm build:loan-genius:wx
```

Or start development with hot reload:

```sh
pnpm dev:loan-genius:wx
```

WeChat output is written to:

```text
demo/loan-genius/dist/wx
```

Open `demo/loan-genius/dist/wx` in WeChat DevTools. Do not open the source package directory.

### WX HMR regression suite

After building the current plugin, run the stateful 27-flow DevTools suite from the repository root:

```sh
pnpm build:plugin
wechatide auth -c Pi
pnpm test:loan-genius:hmr
```

The suite copies Loan Genius into `vite-plugin-taro-loan-genius-hmr-v1` under the system temporary directory, instruments stable automation IDs, and exercises polyfill access, component edits, multi-file updates, bursts, open overlays, hidden pages, navigation, syntax-error recovery, and normal remounting. It also rejects WX-unsafe generated class names after applicable updates and restorations, so known style regressions remain visible as failures. It never edits the package source fixture and stops its Vite server and DevTools project window during cleanup.

The sample enables `polyfills: ['web.url']` for mini programs. Its Vite `define: { URL: 'globalThis.URL' }` makes bare `URL` references use the native or polyfilled global on every target. The polyfill flow checks `globalThis.URL` at startup, switches to bare `URL` through HMR, then restores the original code while checking that calculator state is retained.

Fixture edits atomically replace each source file so Vite never observes a truncated generation. Run the publisher regression tests without DevTools using `pnpm --filter loan-genius test`.

Set `VPT_LOAN_HMR_DEVTOOLS_CLIENT` when the authorized `wechatide` client is not named `Pi`.

## Alipay Mini Program

Set `VITE_VPT_ALIPAY_APP_ID` in `demo/loan-genius/.env.local`, then run from the repository root:

```sh
pnpm build:loan-genius:zfb
pnpm dev:loan-genius:zfb
```

Open `demo/loan-genius/dist/zfb` in Alipay Mini Program Studio.

## TikTok Mini Program (TT)

Set `VITE_VPT_TIKTOK_APP_ID` in `demo/loan-genius/.env.local` to your TikTok Mini Program App ID. From the repository root:

```sh
pnpm build:loan-genius:tt
# Or keep the development build running:
pnpm dev:loan-genius:tt
```

Open `demo/loan-genius/dist/tt` in TikTok DevTools, not the source directory. TT uses native custom navigation and `interpreter` HMR, without WeChat's Skyline settings. Async common packages require base library 2.86.1+; native style hot reload requires DevTools 4.1.4+ and base library 2.98.0.0+.

TT build output is tested, but rendering and HMR state retention still need validation in TikTok DevTools. The automated IDE HMR suite remains WX-only.

## H5

Start the H5 dev server:

```sh
pnpm dev:loan-genius:h5
```

Build and preview the H5 app:

```sh
pnpm build:loan-genius:h5
pnpm preview:loan-genius:h5
```

H5 output is written to:

```text
demo/loan-genius/dist/h5
```

## What this sample demonstrates

- One React 19 + Taro source tree for `wx`, `zfb`, `tt`, and `h5`.
- `vite-plugin-taro` target selection with `VITE_VPT_TARGET`.
- App and page metadata declared in `vite.config.ts`.
- WeChat, Alipay, and TikTok Mini Program output, plus the H5 dev server and production build.
- Tailwind CSS v4 imported from `src/app.css`.
- App-facing imports from `virtual:taro/api` and `virtual:taro/components`.
- WX WXML/WXS/WXSS, ZFB AXML/SJS/ACSS, and TT TTML/SJS/TTSS skeletons with target-native project files and CommonJS entries.

Application code must not import or install `@tarojs/*` packages directly. Use the plugin virtual modules instead:

```tsx
import Taro from 'virtual:taro/api'
import { Text, View } from 'virtual:taro/components'
```

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_VPT_TARGET` | Yes | Set by the root scripts to `wx`, `zfb`, `tt`, or `h5`. |
| `VITE_VPT_WECHAT_APP_ID` | No | WeChat Mini Program app id. Defaults to `touristappid`. |
| `VITE_VPT_ALIPAY_APP_ID` | No | Alipay Mini Program app id written to `mini.project.json`. |
| `VITE_VPT_TIKTOK_APP_ID` | For TT DevTools | TikTok Mini Program App ID written to `dist/tt/project.config.json`. |

For local WeChat testing, put your app id in `demo/loan-genius/.env.local`:

```env
VITE_VPT_WECHAT_APP_ID=your_app_id
```

## Project structure

```text
demo/loan-genius/
├── index.html
├── vite.config.ts
└── src/
    ├── app.tsx
    ├── app.css
    ├── components/
    ├── pages/
    │   └── calculator/
    └── utils/
```

Important files:

| File | Purpose |
| --- | --- |
| `vite.config.ts` | Selects the target and configures aliases, output, pages, app config, and native project metadata. |
| `src/app.tsx` | Root React app component passed to `vite-plugin-taro`. |
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
