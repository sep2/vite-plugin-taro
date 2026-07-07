# create-vite-taro

Create a Vite 8 + React 19 + Taro app for WeChat Mini Program and Web/H5 targets.

## Quick start

```sh
# Create a new app from the default template
npm create vite-taro@latest my-app

# Or create with pnpm
pnpm --config.minimum-release-age=0 create vite-taro@latest my-app

# Enter the project and install dependencies
cd my-app
npm install

# WeChat Mini Program: rebuild dist/wx in watch mode
npm run dev:wx

# Web/H5: start the Vite dev server
npm run dev:h5

# Then open the standard Vite dev URL in your browser
# http://localhost:5173
```

You can keep `npm run dev:wx` and `npm run dev:h5` running at the same time in separate terminals.

Note: Because of WeChat DevTools and Mini Program runtime limitations, hot reload/fast rebuilds for the WeChat target may not always apply cleanly. For day-to-day iteration, prefer the Web/H5 Vite dev server for fast feedback, and periodically verify the Mini Program result in WeChat DevTools.

Set `VITE_PLUGIN_TARO_WECHAT_APP_ID` in the generated `.env.local` to your WeChat Mini Program App ID, then open `dist/wx` with WeChat DevTools for Mini Program development.

The generated app keeps global styles in `src/app.css` and includes Tailwind CSS v4 plus Taro component styles out of the box.

## Other package managers

```sh
pnpm --config.minimum-release-age=0 create vite-taro@latest my-app
yarn create vite-taro my-app
bun create vite-taro my-app
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev:wx` | Build the WeChat Mini Program in watch mode. |
| `npm run dev:h5` | Start the Web/H5 dev server. |
| `npm run build:wx` | Build the WeChat Mini Program output into `dist/wx`. |
| `npm run build:h5` | Build the Web/H5 output into `dist/h5`. |
| `npm run preview:h5` | Preview the built Web/H5 output. |
| `npm run typecheck` | Typecheck with `tsc`. |

## Troubleshooting

| Problem | Check |
| --- | --- |
| `pnpm install` says dependency build scripts were ignored | Run `pnpm approve-builds` and approve the requested dependency build scripts. |

