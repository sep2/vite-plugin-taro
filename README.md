# vite-plugin-taro

Vite 8 + React 19 plugin for building one React/Taro codebase for both WeChat Mini Program (`wx`) and Web (`h5`) targets.

This repository is a pnpm monorepo containing:

- `packages/vite-plugin-taro`: the published Vite plugin.
- `packages/taro-react`: generated React 19-compatible `@tarojs/react` runtime package, published as `vite-plugin-taro-react`.
- `packages/taro-plugin-framework-react`: generated React 19-compatible `@tarojs/plugin-framework-react` runtime package, published as `vite-plugin-taro-plugin-framework-react`.
- `packages/loan-genius`: sample app used to verify H5 and WeChat outputs.

## Usage

```sh
pnpm add -D vite-plugin-taro vite
pnpm add react react-dom
```

See [`packages/vite-plugin-taro/README.md`](packages/vite-plugin-taro/README.md) for plugin usage and package exports.

## Development

```sh
pnpm install
pnpm prepare:taro
pnpm typecheck
pnpm --filter loan-genius build-h5
pnpm --filter loan-genius build-wx
```

## Publishing

The patched runtime packages must be published before the main plugin. Use the one-command release script:

```sh
pnpm publish:all
```

For npm accounts with 2FA:

```sh
pnpm publish:all -- --otp 123456
```

Dry run:

```sh
pnpm publish:dry
```

## License

MIT for `vite-plugin-taro`. Generated Taro runtime packages include upstream Taro MIT license files.
