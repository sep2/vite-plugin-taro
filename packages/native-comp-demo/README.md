# native-comp-demo

Development fixture for integrating WeChat and Alipay native custom components with vpt's Taro React renderer.

> **AI-assisted development is recommended:** Follow the [VPT AI development guide](https://vpt.js.org/guides/ai/) and let a coding assistant create, develop, test, and validate your app.

## Develop

```sh
pnpm --filter native-comp-demo dev-wx
pnpm --filter native-comp-demo dev-zfb
```

Open `packages/native-comp-demo/dist/wx` in WeChat DevTools or `packages/native-comp-demo/dist/zfb` in Alipay Mini Program Studio.
Set `VITE_VPT_WECHAT_APP_ID` or `VITE_VPT_ALIPAY_APP_ID` in `.env.local` for the selected target.

The target-native component sources live under `src/native/wx/native-counter` and `src/native/zfb/native-counter`. Conditional
compilation selects the matching typed `defineNativeComponent()` interface before Rolldown sees the other platform. The feature
is loaded through `React.lazy()`, so this fixture exercises automatic subpackage placement, component registration, property
updates, native events, and named slots on both Mini Program targets.

The index Page contains separate `CustomWrapper` scopes for its Context controls and native-component section, with another
wrapper nested around the lazy demo. This exercises sibling and nested Page-local update boundaries. App-level
`CustomWrapper` usage is intentionally unsupported because the singleton App tree is mirrored across native Pages.

## Validate

```sh
pnpm --filter native-comp-demo typecheck
pnpm --filter native-comp-demo build-wx
pnpm --filter native-comp-demo build-zfb
```
