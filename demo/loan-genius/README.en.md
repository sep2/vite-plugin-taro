# Loan Genius

[简体中文](README.md) | English

A mortgage calculator example built with VPT. One codebase supports WeChat, Alipay, and TikTok Mini Programs, as well as the Web.

This project was migrated from [wuba/Taro-Mortgage-Calculator](https://github.com/wuba/Taro-Mortgage-Calculator).

![Loan Genius screenshot](./screenshots/demo.webp)

[VPT documentation](https://vpt.js.org) · [AI development guide](https://vpt.js.org/guides/ai/)

## Quick start

Requires Node.js 26+, pnpm 11, and the Mini Program DevTools for your target platform.

First, initialize the repository:

```sh
git clone https://github.com/sep2/vite-plugin-taro.git
cd vite-plugin-taro
pnpm install
pnpm prepare:taro
pnpm build:plugin
```

(Optionally) set the corresponding platform's App ID in `demo/loan-genius/.env.local`:

```dotenv
VITE_VPT_WECHAT_APP_ID=your_wechat_app_id
VITE_VPT_ALIPAY_APP_ID=your_alipay_app_id
VITE_VPT_TIKTOK_APP_ID=your_tiktok_app_id
```

## Develop and build

Choose a target below. Each script sets `VITE_VPT_TARGET` automatically:

| Target | Development | Production build | Build output |
| --- | --- | --- | --- |
| WeChat | `pnpm dev:loan-genius:wx` | `pnpm build:loan-genius:wx` | `demo/loan-genius/dist/wx` |
| Alipay | `pnpm dev:loan-genius:zfb` | `pnpm build:loan-genius:zfb` | `demo/loan-genius/dist/zfb` |
| TikTok | `pnpm dev:loan-genius:tt` | `pnpm build:loan-genius:tt` | `demo/loan-genius/dist/tt` |
| Web | `pnpm dev:loan-genius:h5` | `pnpm build:loan-genius:h5` | `demo/loan-genius/dist/h5` |

- Mini Programs: wait for the initial build, then import the output directory into the matching DevTools—not the source directory.
- Web: open the URL printed in the terminal. After building, preview with `pnpm preview:loan-genius:h5`.
- Keep the development command running. See the [HMR guide](https://vpt.js.org/guides/hot-module-replacement/) for platform tool versions and hot-reload settings.

## Edit the app

- `vite.config.ts`: targets, pages, app configuration, and DevTools settings.
- `src/app.tsx` / `src/app.css`: app entry, global styles, and Tailwind CSS.
- `src/pages/calculator/`: calculator, monthly-payment details, and history pages.
- `src/components/` / `src/utils/`: shared components and utilities.

## Testing

See [TESTING.md](TESTING.md) for typechecks, automated tests, WX HMR regression testing, and platform validation scope.

## License

MIT
