# Loan Genius

Sample React/Taro loan calculator app used to verify `vite-plugin-taro` H5 and WeChat Mini Program builds.

- H5 demo: <https://sep2.github.io/vite-plugin-taro/>
- Plugin package: [`vite-plugin-taro`](../vite-plugin-taro)

## What it demonstrates

- One React/Taro codebase targeting both:
  - `h5`: Web output.
  - `wx`: WeChat Mini Program output.
- App code importing through plugin facades:
  - `vite-plugin-taro/components`
  - `vite-plugin-taro/taro`
- Taro-style page routing generated from `vite.config.ts`.
- Conditional source blocks such as `// #ifdef wx` / `// #ifdef h5`.
- Tailwind/CSS output through the plugin pipeline.

## Pages

Configured in [`vite.config.ts`](vite.config.ts):

| Route | Purpose |
| --- | --- |
| `pages/calculator/index` | Main mortgage/loan calculator. |
| `pages/calculator/monthly-payments/index` | Monthly repayment details. |
| `pages/calculator/history/index` | Stored calculation history. |

## Development

From the repository root:

```sh
pnpm install
pnpm prepare:taro
```

Run H5 dev server:

```sh
pnpm dev:sample:h5
```

Build/watch WeChat Mini Program output:

```sh
pnpm dev:sample:wx
```

## Build

From the repository root:

```sh
pnpm build:sample:h5
pnpm build:sample:wx
```

Or from this package:

```sh
pnpm build-h5
pnpm build-wx
```

Outputs:

| Target | Output directory |
| --- | --- |
| `h5` | `packages/loan-genius/dist/h5` |
| `wx` | `packages/loan-genius/dist/wx` |

Open `dist/wx` with WeChat DevTools for Mini Program testing.

## Environment variables

The sample reads variables with the `VITE_PLUGIN_TARO_` prefix.

| Variable | Description | Default |
| --- | --- | --- |
| `VITE_PLUGIN_TARO_TARGET` | Build target: `h5` or `wx`. Usually set by package scripts. | Required |
| `VITE_PLUGIN_TARO_WECHAT_APP_ID` | WeChat Mini Program app id used in `project.config.json`. | `touristappid` |

Local secrets can be placed in `.env.local`; it is ignored by git.

Example:

```sh
VITE_PLUGIN_TARO_WECHAT_APP_ID=wx0000000000000000
```

## GitHub Pages

The H5 build is deployed by the repository workflow `.github/workflows/pages.yml` from:

```txt
packages/loan-genius/dist/h5
```

The sample config uses a relative H5 base path so it works under the GitHub Pages project URL.

## Notes

This app is private to the monorepo and is not published to npm. It exists as an integration fixture and demo for `vite-plugin-taro`.
