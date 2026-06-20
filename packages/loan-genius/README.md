# Loan Genius

Sample React/Taro loan calculator app used to verify `vite-plugin-taro` H5 and WeChat Mini Program builds.

## Development

From the repository root:

```sh
pnpm build:plugin
pnpm dev:sample:h5
```

Build both targets:

```sh
pnpm build:sample:h5
pnpm build:sample:wx
```

Outputs:

| Target | Output directory |
| --- | --- |
| `h5` | `packages/loan-genius/dist/h5` |
| `wx` | `packages/loan-genius/dist/wx` |

Open `dist/wx` with WeChat DevTools for Mini Program testing.

The sample imports app-facing APIs from `vite-plugin-taro/components` and `vite-plugin-taro/taro`.
