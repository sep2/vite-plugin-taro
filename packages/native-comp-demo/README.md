# native-comp-demo

Development fixture for integrating WeChat native custom components with vpt's Taro React renderer.

## Develop

```sh
pnpm --filter native-comp-demo dev-wx
```

Open `packages/native-comp-demo/dist/wx` in WeChat DevTools.

The native component source lives under `src/native/native-counter`. A feature module declares its typed JSX interface
with `defineNativeComponent()` and is loaded through `React.lazy()`, so this fixture exercises automatic subpackage placement,
component registration, property updates, and native events without adding a wrapper around the native tag.

## Validate

```sh
pnpm --filter native-comp-demo typecheck
pnpm --filter native-comp-demo build-wx
```
