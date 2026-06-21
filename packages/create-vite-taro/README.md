# create-vite-taro

Create a Vite 8 + React 19 + Taro app for WeChat Mini Program and H5 targets.

## Quick start

```sh
# Create a new app from the default template
pnpm create vite-taro my-app

# Enter the project and install dependencies
cd my-app
pnpm install

# WeChat Mini Program: rebuild dist/wx in watch mode
pnpm dev:wx

# H5: start the Vite dev server
pnpm dev:h5

# Then open the standard Vite dev URL in your browser
# http://localhost:5173
```

You can keep `pnpm dev:wx` and `pnpm dev:h5` running at the same time in separate terminals.

Note: Because of WeChat DevTools and Mini Program runtime limitations, hot reload/fast rebuilds for the WeChat target may not always apply cleanly. For day-to-day iteration, prefer the H5 Vite dev server for fast feedback, and periodically verify the Mini Program result in WeChat DevTools.

Set `VITE_PLUGIN_TARO_WECHAT_APP_ID` in the generated `.env.local` to your WeChat App ID, then open `dist/wx` with WeChat DevTools for Mini Program development.

## Other package managers

```sh
npm create vite-taro@latest my-app
yarn create vite-taro my-app
bun create vite-taro my-app
```

## Scripts

| Script | Description |
| --- | --- |
| `pnpm dev:wx` | Build the WeChat Mini Program in watch mode. |
| `pnpm dev:h5` | Start the H5 dev server with Vite 8 hot reload. |
| `pnpm build:wx` | Build the WeChat Mini Program output into `dist/wx`. |
| `pnpm build:h5` | Build the H5 output into `dist/h5`. |
| `pnpm preview:h5` | Preview the built H5 output. |
| `pnpm typecheck` | Typecheck with `tsgo`. |

## Troubleshooting

| Problem | Check |
| --- | --- |
| `pnpm install` says dependency build scripts were ignored | Run `pnpm approve-builds`, approve the requested dependency build scripts, then rerun `pnpm install` if needed. |

