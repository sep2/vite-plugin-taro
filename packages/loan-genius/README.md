# Loan Genius

Loan Genius is the sample React/Taro loan calculator app for this repository. It is used to validate `vite-plugin-taro` against both supported targets:

| Target | Output | How to test |
| --- | --- | --- |
| `h5` | `packages/loan-genius/dist/h5` | Open with Vite dev server or preview. |
| `wx` | `packages/loan-genius/dist/wx` | Open the generated directory in WeChat DevTools. |

Live H5 demo: <https://sep2.github.io/vite-plugin-taro/>

## What this sample demonstrates

- A shared React 19 app rendered by Taro for H5 and WeChat Mini Program.
- `vite-plugin-taro` target selection through `VITE_PLUGIN_TARO_TARGET`.
- Taro app/page metadata declared in `vite.config.ts`.
- App-facing imports from `virtual:taro/components` and `virtual:taro/api`.
- WeChat-specific `project.config.json` and `sitemap.json` emission.
- H5 output suitable for GitHub Pages.

## Run the sample

Run commands from the repository root.

```sh
pnpm install
pnpm prepare:taro
pnpm build:plugin
```

Start the H5 dev server:

```sh
pnpm dev:sample:h5
```

Build the H5 app:

```sh
pnpm build:sample:h5
pnpm preview:sample:h5
```

Build the WeChat Mini Program once:

```sh
pnpm build:sample:wx
```

Build the WeChat Mini Program in watch mode:

```sh
pnpm dev:sample:wx
```

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_PLUGIN_TARO_TARGET` | Yes | Set by the root scripts to either `h5` or `wx`. |
| `VITE_PLUGIN_TARO_WECHAT_APP_ID` | No | WeChat Mini Program app id. Defaults to `touristappid` when unset. |

For local WeChat testing, place your app id in `packages/loan-genius/.env.local`:

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
| `vite.config.ts` | Configures aliases, output directory, target validation, pages, app JSON, and WeChat project metadata. |
| `src/app.ts` | Root React app component passed to `vite-plugin-taro`. |
| `src/pages/calculator/index.tsx` | First page and default route. |
| `src/pages/calculator/monthly-payments/index.tsx` | Monthly payment detail page. |
| `src/pages/calculator/history/index.tsx` | Calculator history page. |
| `src/app.css` | Global styles imported by the app component. |

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
import { Text, View } from 'virtual:taro/components'
import Taro from 'virtual:taro/api'
```

## Troubleshooting

| Problem | Fix |
| --- | --- |
| H5 dev server cannot resolve `vite-plugin-taro` | Run `pnpm build:plugin` first. |
| WeChat DevTools shows the wrong project | Open `packages/loan-genius/dist/wx`, not the source package directory. |
| WeChat app id errors | Set `VITE_PLUGIN_TARO_WECHAT_APP_ID` or keep the default `touristappid` for tourist-mode testing. |
| A page is missing from the build | Add it to the `pages` array in `vite.config.ts` and ensure the file path is `src/${page.path}.tsx`. |

## License

MIT. See [`LICENSE`](LICENSE).
