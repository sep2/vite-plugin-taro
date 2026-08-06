# native-comp-demo

Development fixture for integrating WeChat native custom components with vpt's Taro React renderer.

## Develop

```sh
pnpm --filter native-comp-demo dev-wx
```

Open `packages/native-comp-demo/dist/wx` in WeChat DevTools.

The native component source is intentionally kept as a prebuilt component family under
`public/components/native-counter`. The React page registers it through `usingComponents` and exercises property updates
from React and custom events from the native component.

## Validate

```sh
pnpm --filter native-comp-demo typecheck
pnpm --filter native-comp-demo build-wx
```
