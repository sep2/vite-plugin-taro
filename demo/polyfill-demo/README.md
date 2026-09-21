# Polyfill demo

WX / ZFB runtime fixture for VPT's opt-in `polyfills` option; TikTok (抖音 / TT) is not configured in this fixture. The page runs 12 checks at module startup, shows individual PASS/FAIL results and offers a **Run again** button.

Checks cover URL, URLSearchParams, Array.at/findLast/toSorted/toReversed, Object.fromEntries, String.replaceAll, Promise.allSettled/any, structuredClone and queueMicrotask. `src/polyfill-cases.ts` supplies both the checks and the core-js module list consumed by `vite.config.ts`; there are no direct core-js imports in application code.

The checks use bare `URL` and `URLSearchParams` without Vite `define` mappings. The selected polyfills install missing APIs on the shared global object before application code runs; see the [configuration guide](https://vpt.js.org/guides/configuration/#polyfills).

## Run

From the repository root:

```sh
pnpm install
pnpm prepare:taro
pnpm build:plugin
pnpm dev:polyfill-demo:wx
# Or: pnpm dev:polyfill-demo:zfb
```

Import `demo/polyfill-demo/dist/wx` into WeChat DevTools or `demo/polyfill-demo/dist/zfb` into Alipay DevTools. Expect **12/12 passed**, including after clicking **Run again**. Check both development and production builds, and real devices when validating older engines. These checks do not establish TikTok compatibility; this fixture has no `dist/tt` output.

Optional `.env.local` settings: `VITE_VPT_WECHAT_APP_ID` (defaults to `touristappid`) and `VITE_VPT_ALIPAY_APP_ID`.

```sh
pnpm build:polyfill-demo:wx
pnpm build:polyfill-demo:zfb
pnpm typecheck:polyfill-demo
pnpm test:polyfill-demo
```

The Node tests validate the check logic against Node's native APIs, not polyfill installation. The mini-program page validates actual runtime behavior; native implementations may satisfy checks on newer engines. This fixture does not delete or replace host globals to force fallback paths. VPT's isolated-realm integration tests cover missing-native scenarios separately. Configured core-js modules are emitted in `common/polyfills.js` before application code.
