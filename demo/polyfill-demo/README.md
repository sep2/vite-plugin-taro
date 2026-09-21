# Polyfill demo

WX / ZFB / TikTok (抖音 / TT) runtime fixture for VPT's opt-in `polyfills` option. The page runs 12 checks at module startup, shows individual PASS/FAIL results and offers a **Run again** button.

Checks cover URL, URLSearchParams, Array.at/findLast/toSorted/toReversed, Object.fromEntries, String.replaceAll, Promise.allSettled/any, structuredClone and queueMicrotask. `src/polyfill-cases.ts` supplies both the checks and the core-js module list consumed by `vite.config.ts`; there are no direct core-js imports in application code.

All checks use bare API bindings, including `URL`, `URLSearchParams`, `structuredClone`, and `queueMicrotask`, without `globalThis` property access or Vite `define` mappings. The selected polyfills install missing APIs on the shared global object before application code runs; see the [configuration guide](https://vpt.js.org/guides/configuration/#polyfills).

## Run

From the repository root:

```sh
pnpm install
pnpm prepare:taro
pnpm build:plugin
pnpm dev:polyfill-demo:wx
# Or: pnpm dev:polyfill-demo:zfb
# Or: pnpm dev:polyfill-demo:tt
```

Import the generated project into the matching developer tool:

| Target | Output | Developer tool |
| --- | --- | --- |
| WX | `demo/polyfill-demo/dist/wx` | WeChat DevTools |
| ZFB | `demo/polyfill-demo/dist/zfb` | Alipay DevTools |
| TT | `demo/polyfill-demo/dist/tt` | TikTok / 抖音 DevTools |

Expect **12/12 passed**, including after clicking **Run again**. Check both development and production builds, and real devices when validating older engines. TT uses interpreter HMR, like ZFB; WX uses DevTools HMR.

App IDs can be supplied in `.env.local`: `VITE_VPT_WECHAT_APP_ID` (defaults to `touristappid`), `VITE_VPT_ALIPAY_APP_ID`, and `VITE_VPT_TIKTOK_APP_ID`. Use your own TT App ID when importing into TikTok DevTools.

```sh
pnpm build:polyfill-demo:wx
pnpm build:polyfill-demo:zfb
pnpm build:polyfill-demo:tt
pnpm typecheck:polyfill-demo
pnpm test:polyfill-demo
```

The Node tests validate the check logic against Node's native APIs, verify that WX/ZFB/TT production builds preserve bare API calls, and check the TT build's configuration, native assets, and selected polyfill modules. They do not establish polyfill installation or HMR behavior in TikTok DevTools or on devices. The mini-program page validates actual runtime behavior; native implementations may satisfy checks on newer engines. This fixture does not delete or replace host globals to force fallback paths. VPT's isolated-realm integration tests cover missing-native scenarios separately. Configured core-js modules are emitted in `common/polyfills.js` before application code.
