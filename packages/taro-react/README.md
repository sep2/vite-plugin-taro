# vite-plugin-taro-react

> React 19 compatibility build of `@tarojs/react@4.2.0` for `vite-plugin-taro`.

## Status

This is a generated support package. It is published so `vite-plugin-taro` can depend on a React 19-compatible Taro React runtime through the `@tarojs/react` package slot. Application code should not import this package directly.

Most apps should install `vite-plugin-taro` and import app-facing APIs through its virtual modules instead:

```tsx
import { View } from 'virtual:taro/components'
import Taro from 'virtual:taro/api'
```

## Why this package exists

`vite-plugin-taro` targets React 19 while keeping the official Taro runtime behavior. This package is produced from the upstream Taro npm tarball plus a small local compatibility patch, then published under the `vite-plugin-taro-react` name for reproducible installs.

## Generated source

- Generator: [`scripts/build-patched-taro-packages.mjs`](../../scripts/build-patched-taro-packages.mjs)
- Patch: [`patches/@tarojs__react@4.2.0-react19.patch`](../../patches/@tarojs__react@4.2.0-react19.patch)
- Output package directory: [`packages/taro-react`](.)

Regenerate from the repository root:

```sh
pnpm prepare:taro
```

## Maintenance checklist

When updating the upstream Taro version:

1. Update `upstreamVersion` in `scripts/build-patched-taro-packages.mjs`.
2. Refresh the matching patch file in `patches/`.
3. Update this package version in `package.json`.
4. Update this package README.
5. Run `pnpm prepare:taro`.
6. Run `pnpm build:plugin`, `pnpm typecheck`, `pnpm build:sample:h5`, and `pnpm build:sample:wx`.

## License

MIT. Upstream Taro is MIT licensed by O2Team. See [`LICENSE`](LICENSE).
