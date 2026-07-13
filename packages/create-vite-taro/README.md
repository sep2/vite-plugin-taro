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

# WeChat Mini Program: start Vite with hot reload
npm run dev:wx

# Web/H5: start the Vite dev server
npm run dev:h5

# Then open the standard Vite dev URL in your browser
# http://localhost:5173
```

You can keep `npm run dev:wx` and `npm run dev:h5` running at the same time in separate terminals.

WeChat development supports Vite-powered hot reload. JavaScript edits preserve the running App and `globalData`, active
native page, and React/input state, while other changes are rebuilt automatically. State-preserving hot reload requires
`compileHotReLoad: true`; generated projects enable it automatically.

Hot reload details:
[WeChat Mini Program HMR architecture](https://github.com/sep2/vite-plugin-taro/blob/main/draft/hmr-architecture.md).

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
| `npm run dev:wx` | Start WeChat Mini Program development with hot reload. |
| `npm run dev:h5` | Start the Web/H5 dev server. |
| `npm run build:wx` | Build the WeChat Mini Program output into `dist/wx`. |
| `npm run build:h5` | Build the Web/H5 output into `dist/h5`. |
| `npm run preview:h5` | Preview the built Web/H5 output. |
| `npm run typecheck` | Typecheck with `tsc`. |

## Troubleshooting

| Problem | Check |
| --- | --- |
| `pnpm install` says dependency build scripts were ignored | Run `pnpm approve-builds` and approve the requested dependency build scripts. |

