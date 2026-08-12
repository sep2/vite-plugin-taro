# towxml-stream-demo

A WeChat Mini Program demo with a React/Tailwind chat shell and the native Towxml stream typewriter renderer from
[`zhouzxx/towxml-stream-typewriter-weChat-example`](https://github.com/zhouzxx/towxml-stream-typewriter-weChat-example).

## Architecture

- `src/pages/index`: React chat page, message list, composer, request flow, and stream feeder; all UI styling uses Tailwind.
- `src/native/towxml-adapter/towxml`: an unmodified direct copy of the upstream `pages/towxml` folder at commit
  `8708a702f7f651f0cf4f2f7a357804c62e428a81`.
- `src/native/towxml-adapter/towxml-adapter.*`: a small native property/event adapter. It accumulates bounded, ordered Markdown
  chunks inside the native layer and bridges stream state and scroll position while preserving Towxml's cross-message virtual
  rendering without changing the copied implementation.
- `src/pages/index/towxml-message.tsx`: the typed JSX interface declared with `defineNativeComponent()`, loaded lazily so its
  native assets can be placed in an automatic subpackage.

The demo is WX-only because Towxml is a native WeChat component.

## Develop

```sh
pnpm --filter towxml-stream-demo dev-wx
```

Open `packages/towxml-stream-demo/dist/wx` in WeChat DevTools. Set `VITE_VPT_WECHAT_APP_ID` in `.env.local` when
you want to use a real Mini Program AppID.

## Validate

```sh
pnpm --filter towxml-stream-demo typecheck
pnpm --filter towxml-stream-demo build-wx
```
