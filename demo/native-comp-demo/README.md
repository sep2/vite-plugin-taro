# native-comp-demo

Development fixture for integrating WeChat, Alipay, and TikTok (抖音 / TT) native custom components with vpt's Taro React renderer.

> **AI-assisted development is recommended:** Follow the [VPT AI development guide](https://vpt.js.org/guides/ai/) and let a coding assistant create, develop, test, and validate your app.

## Develop

```sh
pnpm --filter native-comp-demo dev-wx
pnpm --filter native-comp-demo dev-zfb
pnpm --filter native-comp-demo dev-tt
```

Open `demo/native-comp-demo/dist/wx` in WeChat DevTools, `demo/native-comp-demo/dist/zfb` in Alipay Mini Program Studio, or `demo/native-comp-demo/dist/tt` in TikTok DevTools. Import the generated directory, not the source project.
Set `VITE_VPT_WECHAT_APP_ID`, `VITE_VPT_ALIPAY_APP_ID`, or `VITE_VPT_TIKTOK_APP_ID` in `demo/native-comp-demo/.env.local` for the selected target. The TT variable holds your TikTok App ID.

The target-native component sources live under `src/native/{wx,zfb,tt}/native-counter`. Conditional compilation selects the matching typed `defineNativeComponent()` interface before Rolldown sees the other platforms. TT uses `.ttml` / `.ttss`, native `properties` / `triggerEvent()`, and a named `title` slot.

The Page demo is loaded through `React.lazy()`, exercising automatic common-package placement. App also uses the native counter synchronously, so the shared native assets remain in the main package. The fixture demonstrates component registration, property updates, native events, and named slots on all three Mini Program targets.

### TikTok development

From the repository root:

```sh
pnpm dev:native-comp-demo:tt
# Or build once:
pnpm build:native-comp-demo:tt
```

TT selects `hmr.mode: 'interpreter'`, top-level `compileHotReload: true`, and `setting.autoCompile: true`; it does not use WeChat Skyline or glass-easel settings. Async common packages require base library **2.86.1+**. Native style hot reload requires DevTools **4.1.4+** and base library **2.98.0.0+**. See the [HMR guide](https://vpt.js.org/guides/hot-module-replacement/#抖音开发配置).

The index Page contains separate `CustomWrapper` scopes for its Context controls and native-component section, with another
wrapper nested around the lazy demo. This exercises sibling and nested Page-local update boundaries. App-level
`CustomWrapper` usage is intentionally unsupported because the singleton App tree is mirrored across native Pages.

## Validate

```sh
pnpm --filter native-comp-demo typecheck
pnpm --filter native-comp-demo build-wx
pnpm --filter native-comp-demo build-zfb
pnpm --filter native-comp-demo build-tt
pnpm --filter native-comp-demo test
```

The Node tests build the real TT fixture, check target-native assets, component registration, slot/event bindings, and common subpackages, and exercise the native increment handler. They do not simulate TikTok rendering or prove DevTools HMR state retention.

In TikTok DevTools, check **Increment from native**, **Add 10 from React**, the named-slot count, and navigation to the mirror Page. Save a compatible React edit and confirm App, Page, and counter state remain intact.
