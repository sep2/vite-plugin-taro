# vite-plugin-taro-runtime

> WX App-wrap build of `@tarojs/runtime@4.2.1` for `vite-plugin-taro`.

> **AI-assisted development is recommended:** Follow the [VPT AI development guide](https://vpt.js.org/guides/ai/) and let a coding assistant create, develop, test, and validate your app.

## Status

This is a generated support package. It is published so `vite-plugin-taro` can use one reproducibly patched Taro runtime. Application code should not import this package directly.

Most apps should install `vite-plugin-taro` and import app-facing APIs through its virtual modules instead:

```tsx
import { View } from 'virtual:taro/components'
import Taro from 'virtual:taro/api'
```

## Why this package exists

The WX renderer needs direct `page.*` paths and an opaque private Page outlet while H5 retains upstream Taro behavior. This package is produced from the upstream Taro npm tarball plus a small local patch, then published under the `vite-plugin-taro-runtime` name for reproducible installs.

## Generated source

- Generator: [`scripts/build-patched-taro-packages.ts`](../../scripts/build-patched-taro-packages.ts)
- Patch: [`patches/@tarojs__runtime@4.2.1.patch`](../../patches/@tarojs__runtime@4.2.1.patch)
- Output package directory: [`packages/taro-runtime`](.)

Regenerate from the repository root:

```sh
pnpm prepare:taro
```

## Maintenance checklist

When updating the upstream Taro version:

1. Update `upstreamVersion` in `scripts/build-patched-taro-packages.ts`.
2. Refresh the matching patch file in `patches/`.
3. Update this package version in `package.json`.
4. Update this package README.
5. Run `pnpm prepare:taro`.
6. Run `pnpm build:plugin`, `pnpm typecheck`, `pnpm build:loan-genius:wx`, and `pnpm build:loan-genius:h5`.

## License

MIT. Upstream Taro is MIT licensed by O2Team. See [`LICENSE`](LICENSE).
