# Vite Taro App

A cross-platform app built with [Vite 8](https://vite.dev), React 19, Taro 4, TypeScript, and Tailwind CSS v4. The same React codebase runs as a WeChat Mini Program and a Web app.

- [Documentation](https://vpt.js.org)
- [GitHub](https://github.com/sep2/vite-plugin-taro)

## Get started

Install the dependencies:

```sh
npm install
```

### Web

```sh
npm run dev:h5
```

Open the URL printed by Vite, usually <http://localhost:5173>.

### WeChat Mini Program

1. Replace the generated placeholder in `.env.local` with your WeChat App ID:

    ```dotenv
    VITE_VPT_WECHAT_APP_ID=wx1234567890abcdef
    ```

2. Start the WeChat development build:

    ```sh
    npm run dev:wx
    ```

3. In WeChat DevTools, import `dist/wx`—not the project root.

Keep the Vite process running while you work. The template configures WeChat DevTools for hot reload, disables URL checks for local development, and keeps Skyline rendering disabled in DevTools because Skyline does not currently support hot reload there.

You can run `dev:wx` and `dev:h5` in separate terminals to develop both targets at once.

## Start building

The default page is `src/pages/home/index.tsx`. Edit it while the counter is active to see React state survive a hot update.

Use VPT's virtual modules for Taro components and APIs:

```tsx
import Taro from 'virtual:taro/api'
import { Button, Text, View } from 'virtual:taro/components'
```

Do not install or import `@tarojs/*` packages directly. Add pages and change application or WeChat project settings in `vite.config.ts`.

The starter also demonstrates:

- shared React components across WeChat and Web;
- target-specific code with `// #ifdef wx` and `// #ifdef h5`;
- a typed native WeChat component with a Web counterpart;
- lazy-loaded React components;
- a custom navigation bar; and
- Tailwind CSS, CSS Modules, and global CSS.

Delete or replace any example code you do not need.

## Styling

Global styles and Tailwind theme tokens live in `src/app.css`. Keep the Tailwind imports and `@source "./";` directive so classes used under `src` are discovered for both targets.

Use complete Tailwind class names in source code instead of constructing them from string fragments. For isolated component styles, create a `*.module.css` file and import it from the component.

VPT hot-updates imported styles in both targets. For WeChat, it publishes generated WXSS together with the component update so the current page and React state remain intact.

## Hot reload

During normal WeChat updates, VPT preserves the running App, current page, compatible React Hook state, and native input values. A full reload is expected after changes to Vite configuration, incompatible component or Hook structure, or an update that cannot be applied safely.

See the [hot reload guide](https://vpt.js.org/guides/hot-module-replacement/) for configuration and troubleshooting details.

## Scripts

| Command | Description | Output |
| --- | --- | --- |
| `npm run dev:wx` | Develop the WeChat Mini Program with hot reload | `dist/wx` |
| `npm run dev:h5` | Start the Web development server | — |
| `npm run build:wx` | Build the WeChat Mini Program | `dist/wx` |
| `npm run build:h5` | Build the Web app | `dist/h5` |
| `npm run preview:h5` | Preview the Web production build | — |
| `npm run typecheck` | Typecheck the project with TypeScript | — |

## Project structure

```text
.
├── .env.local                 # Local WeChat App ID (ignored by Git)
├── vite.config.ts             # VPT, pages, and target configuration
└── src/
    ├── app.tsx                # Shared application entry
    ├── app.css                # Global styles and Tailwind theme
    ├── components/            # Shared and target-specific components
    └── pages/home/index.tsx   # Default page
```

## Troubleshooting

- **WeChat DevTools cannot open the app:** import `dist/wx` and verify that `.env.local` contains an App ID available to your WeChat account.
- **Changes do not appear in WeChat:** confirm `dev:wx` is still running, DevTools has the current `dist/wx` open, and the terminal has no build errors.
- **Tailwind classes are missing:** keep `@source "./";` in `src/app.css` and write each possible class name as a complete string.
- **pnpm reports ignored dependency build scripts:** run `pnpm approve-builds`, approve the requested scripts, and install again.

Continue with the [quick start guide](https://vpt.js.org/guides/quick-start/) or browse the [complete documentation](https://vpt.js.org).
