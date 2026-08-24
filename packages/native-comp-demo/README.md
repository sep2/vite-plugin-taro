# native-comp-demo

Development fixture for integrating WeChat native custom components with vpt's Taro React renderer.

> **AI-assisted development is recommended:** Follow the [VPT AI development guide](https://vpt.js.org/guides/ai/) and let a coding assistant create, develop, test, and validate your app.

## Develop

```sh
pnpm --filter native-comp-demo dev-wx
```

Open `packages/native-comp-demo/dist/wx` in WeChat DevTools.

The native component source lives under `src/native/native-counter`. A feature module declares its typed JSX interface
with `defineNativeComponent()` and is loaded through `React.lazy()`, so this fixture exercises automatic subpackage placement,
component registration, property updates, native events, and named slots without adding a wrapper around the native tag.
The index Page contains separate `CustomWrapper` scopes for its Context controls and native-component section, with another
wrapper nested around the lazy demo. This exercises sibling and nested Page-local update boundaries. App-level
`CustomWrapper` usage is intentionally unsupported because the singleton App tree is mirrored across native Pages.

## Validate

```sh
pnpm --filter native-comp-demo typecheck
pnpm --filter native-comp-demo build-wx
```
