# create-vite-taro

Create a Vite 8 + React 19 + Taro app for H5 and WeChat Mini Program targets.

```sh
pnpm create vite-taro my-app
cd my-app
pnpm install
pnpm dev:h5
```

Other package managers:

```sh
npm create vite-taro@latest my-app
yarn create vite-taro my-app
bun create vite-taro my-app
```

## Generated scripts

| Script | Description |
| --- | --- |
| `pnpm dev:h5` | Start the H5 dev server with Vite 8 hot reload. |
| `pnpm dev:wx` | Build the WeChat Mini Program in watch mode. |
| `pnpm build:h5` | Build the H5 output into `dist/h5`. |
| `pnpm build:wx` | Build the WeChat Mini Program output into `dist/wx`. |
| `pnpm preview:h5` | Preview the built H5 output. |
| `pnpm typecheck` | Typecheck with `tsgo`. |

Open `dist/wx` with WeChat DevTools for Mini Program development.
