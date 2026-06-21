# Monorepo context

This repository is a pnpm v11 workspace for `vite-plugin-taro`, a Vite 8 / React 19 / Taro integration that builds shared apps for WeChat Mini Program (`wx`) and H5 targets.

- `packages/vite-plugin-taro`: publishable Vite plugin package. Source lives in `src`, build output is `dist`, and package README files are synced during build.
- `packages/create-vite-taro`: publishable project generator package (`create-vite-taro`) with templates under `templates/default`.
- `packages/taro-react`: generated React 19-compatible fork of `@tarojs/react`, published as `vite-plugin-taro-react`.
- `packages/taro-plugin-framework-react`: generated React 19-compatible fork of `@tarojs/plugin-framework-react`, published as `vite-plugin-taro-plugin-framework-react`.
- `packages/loan-genius`: sample app used to test the plugin against `h5` and `wx` targets.
- `patches`: local patches applied to upstream Taro 4.2.0 packages when regenerating the generated packages.

Node.js v26+ is available and can execute TypeScript natively. Packages declare `node >=22`. TypeScript checking uses `@typescript/native-preview` / `tsgo`.

# Commands

- `pnpm prepare:taro`: regenerate patched Taro packages from upstream npm tarballs and local patch files.
- `pnpm build:plugin`: build `packages/vite-plugin-taro`.
- `pnpm typecheck`: typecheck the plugin and sample app.
- `pnpm lint`: run Biome checks.
- `pnpm format`: run Biome checks with safe writes.
- `pnpm build:sample:h5`: build the sample H5 target.
- `pnpm build:sample:wx`: build the sample WeChat Mini Program target.
- `pnpm dev:sample:h5`: run the sample H5 dev server.
- `pnpm dev:sample:wx`: rebuild the sample WeChat Mini Program target in watch mode.
- `pnpm preview:sample:h5`: preview the built sample H5 target.
- `pnpm publish:dry`: validate the release without publishing.
- `pnpm publish:all`: publish public packages in dependency order.

# Generated files and packages

- Do not manually edit `packages/vite-plugin-taro/dist`; rebuild it with `pnpm build:plugin`.
- Do not manually edit generated Taro package implementation files under `packages/taro-react` or `packages/taro-plugin-framework-react`. Change the relevant file in `patches/*@4.2.0-react19.patch`, then run `pnpm prepare:taro`.
- The generated Taro package `package.json` and `README.md` files are local metadata and are preserved by `pnpm prepare:taro`.

# Code style

- TypeScript strict mode. Use `tsgo` for typechecking.
- Prefer `import type` for type-only imports.
- 4 spaces, line width 120, single quotes, semicolons as needed, no trailing commas. Use Biome to format files.
- File names are kebab-case.
- React components are PascalCase.
- Functions and variables are camelCase.
