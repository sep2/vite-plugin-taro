# vite-plugin-taro-runtime

> Taro runtime and platform adapters built for `vite-plugin-taro`.

## Status

This is an internal support package. Applications should install `vite-plugin-taro` and use its virtual modules instead of importing this package directly.

## Architecture

The package build consumes pinned development dependencies for Taro's runtime, generic APIs, Taro facade, components, router, H5 APIs, React renderer, React framework runtime, and WX, Alipay, and H5 platform packages. It emits only the application runtime files used by VPT, so Taro's compiler packages do not become production dependencies of generated projects.

Output directories and exports mirror the upstream Taro package names (`runtime`, `api`, `taro`, `components`, `router`, `taro-h5`, `react`, `plugin-framework-react`, and each `plugin-platform-*` package). The upstream ESM runtime graph is copied unchanged while the unexported CommonJS duplicate is omitted. Its entries are exposed through the explicit `runtime/mini` and `runtime/h5` export names. Application builds therefore load only the selected package entry and retain normal Rolldown tree-shaking.

The `api`, `taro`, `components`, `router`, and `taro-h5` directories retain the runtime files and declarations used by VPT. Alternate bundles and the components' unused lazy-loader JavaScript are omitted. The generic Taro facade retains its CommonJS package boundary. Copied declarations redirect imports and module augmentations to this package's type exports, so consumer type checking does not depend on Vite aliases or upstream development dependencies. CSS remains side-effectful, and required third-party runtime dependencies are declared directly. None of these upstream Taro packages—and therefore none of their `@tarojs/helper` compiler dependencies—are installed in consumer projects.

## Development

Build the runtime package from the repository root:

```sh
pnpm --filter vite-plugin-taro-runtime build
```

`pnpm prepare:taro` invokes the same build after pnpm has applied the repository patches to its development inputs.

## License

MIT. Upstream Taro is MIT licensed by O2Team. See [`LICENSE`](LICENSE).
