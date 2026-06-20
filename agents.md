# Monorepo context

This repository is a pnpm v11 monorepo for `vite-plugin-taro`.

- `packages/vite-plugin-taro`: publishable Vite 8 / React 19 plugin package.
- `packages/taro-react`: generated React 19-compatible package published as `vite-plugin-taro-react`.
- `packages/taro-plugin-framework-react`: generated React 19-compatible package published as `vite-plugin-taro-plugin-framework-react`.
- `packages/loan-genius`: sample app used to test the plugin against `h5` and `wx` targets.

Node.js v26+ is available and can execute TypeScript natively.

# Commands

- `pnpm prepare:taro`: regenerate patched Taro packages from upstream npm tarballs and local patch files.
- `pnpm build:plugin`: build the plugin.
- `pnpm typecheck`: typecheck plugin and sample app.
- `pnpm build:sample:h5`: build the sample H5 target.
- `pnpm build:sample:wx`: build the sample WeChat target.

# Code style

- TypeScript strict mode. Use `tsgo` for typechecking.
- Prefer `import type` for type-only imports.
- 4 spaces, single quotes, no trailing commas. Use Biome to format files.
- File names are kebab-case.
- React components are PascalCase.
- Functions and variables are camelCase.
