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

## Mini-program global-object investigation

Official documentation reviewed on **2026-09-21**. This is a documentation audit, not a device-tested compatibility matrix. It covers application/page JavaScript in the **logic layer**, excluding mini-games, embedded H5 pages, Workers, and framework-provided globals. The additional platforms below are research subjects, not targets supported by this fixture or VPT.

Three different capabilities must not be conflated:

- **Engine support:** whether the JavaScript engine implements `globalThis` or another standard API natively.
- **Host exposure:** whether the mini-program sandbox permits application code to access that binding.
- **Polyfilled availability:** whether the platform, compiler, or application supplies an implementation or substitute object.

**Confirmed restrictions:** Douyin prohibits access to `globalThis` and `window`; DingTalk prohibits `globalThis` and `global`; Alipay prohibits global-context access by default but provides an explicit opt-in. Lack of browser `window`/DOM support does **not** imply lack of `globalThis`.

### Platform findings

**Unconfirmed** means the reviewed official documentation does not establish native `globalThis` availability or an explicit prohibition. It does not mean the API is absent. Engine descriptions and ES6 compatibility tables are not sufficient evidence of current native `globalThis` support.

| Platform | `globalThis` / global-context access | Browser `window` / `document` in the logic layer |
| --- | --- | --- |
| WeChat / 微信 | **Unconfirmed native support.** Standard API support varies by execution environment; the base library includes core-js polyfills. [JS support][wx-js] | Explicitly unavailable. [Logic layer][wx-logic] |
| JD / 京东 | **Unconfirmed.** No explicit statement found in the reviewed framework/runtime documentation. [Documentation][jd-docs] | No explicit per-object statement found; browser-global support is not established. |
| Baidu / 百度智能小程序 | **Unconfirmed.** [Introduction][baidu-intro] | The documented architecture separates the logic thread from the WebView rendering thread; this does not establish access to browser globals or page DOM. |
| Alipay / 支付宝 | **Blocked by default; configurable.** `globalObjectMode: "enable"` exposes the real global object; `"fake"` exposes a virtual object. [JS engine][alipay-js], [project configuration][alipay-config] | Explicitly unavailable, independently of `globalObjectMode`. [Framework overview][alipay-framework] |
| Douyin / 抖音 | **Explicitly prohibited:** `globalThis`. [Runtime][douyin-runtime] | `window` explicitly prohibited; logic and rendering run in separate environments. |
| QQ | **Unconfirmed.** Documentation describes engine differences and platform polyfills, not a native `globalThis` guarantee. [Runtime][qq-runtime] | Explicitly unavailable. [Logic layer][qq-logic] |
| DingTalk / 钉钉 | **Explicitly prohibited:** `globalThis` and `global`. [JS engine][dingtalk-js] | `window`, `document`, and `self` are reserved module/import names; this is not a browser-global support guarantee. |
| WeCom / 企业微信 | **Unconfirmed separately.** The client embeds the WeChat mini-program base library/engine, but that does not establish identical version-specific capabilities. [Before development][wecom-guide] | Treat as WeChat-style logic-layer code, not a browser environment; this is an architectural inference. |
| Alipay IoT / 支付宝 IoT | **Unconfirmed separately.** Official docs state that it shares a container with Alipay mini-programs, but do not establish IoT support/version requirements for `globalObjectMode`. [Introduction][alipay-iot] | Shared-container architecture is not a separate guarantee of browser-global support. |
| Feishu / 飞书 | **Unconfirmed.** Sharing the `tt` API namespace does not establish the same restrictions as Douyin. [Logic layer][feishu-logic] | Explicitly unavailable. |
| Kuaishou / 快手 | **Unconfirmed.** `App`, `getApp()`, and `globalData` do not establish a JavaScript global-object binding. [App][kuaishou-app] | No explicit per-object statement found. `app.json.window` is UI configuration, not the JavaScript `window` object. [Configuration][kuaishou-config] |
| Xiaohongshu / 小红书 | **Unconfirmed native support.** Official docs say the build supplies missing polyfills and syntax transforms; availability after compilation is not proof of native implementation. [JS support][xhs-js] | Logic and rendering are separate contexts; the view-layer WebView does not establish browser-global access in application JS. [Startup process][xhs-startup] |

### Alipay: real versus virtual global objects

The official [project configuration][alipay-config] documents these access policies:

| `globalObjectMode` | Meaning |
| --- | --- |
| `legacy` | Prohibit global-object access. |
| `enable` | Expose the real mini-program JavaScript global object through `global` and `globalThis`. |
| `fake` | Expose a shared virtual empty object, not the real JavaScript global object. |

The documented requirements are **IDE 3.8.1+** and **CLI 2.0.0+**. For the current format-2 `mini.project.json` schema:

```json
{
    "format": 2,
    "compileOptions": {
        "globalObjectMode": "enable"
    }
}
```

This is an official Alipay configuration example, not an instruction to edit this fixture. It does not provide `window`, `document`, or browser DOM APIs, and its support must not be assumed for DingTalk or Alipay IoT.

The docs illustrate the semantic difference with `global.Math === Math`: it is `true` in `enable` mode and `false` in `fake` mode. Merely finding an object called `globalThis` is therefore insufficient to prove that polyfills will modify the real global bindings.

### Implications for polyfills and validation

- `globalThis` is an ECMAScript global-context entry point; browser `window`/`self` and Node-style `global` are not portable fallback bindings across mini-program hosts.
- `wx`, `my`, `tt`, and `ks` are platform API namespaces; `getApp()` returns an application instance. None should be assumed to be the JavaScript global object.
- Reserved import names are a separate restriction from runtime availability. In Alipay, alias reserved imported symbols rather than assuming they are safe local bindings; see the [framework overview][alipay-framework].
- `Function('return this')()` is not a portable fallback. Douyin, DingTalk, and Alipay prohibit dynamic function construction. WeChat and Xiaohongshu explicitly document an exception for `new Function('return this')`; that exception must not be generalized to other platforms.
- The bare-binding checks in this fixture validate usable APIs **after** the configured bootstrap. Passing them does not establish native engine support or direct host exposure of `globalThis`.
- To establish native support, use a separate minimal native project before application/framework polyfills load, record client/OS/base-library/tool versions and global-object configuration, and distinguish platform-supplied polyfills from engine implementations. Compare IDE and real-device results; do not infer other hosts from a shared API namespace or engine family.

For capability tracking, retain **blocked**, **configurable**, and **unconfirmed** findings rather than treating every platform without an explicit ban as supported. This investigation adds no real-device or HMR verification claims.

[wx-js]: https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/js-support.html
[wx-logic]: https://developers.weixin.qq.com/miniprogram/dev/framework/app-service/
[jd-docs]: https://mp-docs.jd.com/
[baidu-intro]: https://smartprogram.baidu.com/docs/develop/tutorial/intro/
[alipay-js]: https://opendocs.alipay.com/mini/framework/implementation-detail
[alipay-config]: https://opendocs.alipay.com/mini/03dbc3#globalObjectMode
[alipay-framework]: https://opendocs.alipay.com/mini/framework/overview
[douyin-runtime]: https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/tutorial/runtime
[qq-runtime]: https://q.qq.com/wiki/develop/miniprogram/frame/useful/useful_env.html
[qq-logic]: https://q.qq.com/wiki/develop/miniprogram/frame/logic/
[dingtalk-js]: https://open.dingtalk.com/document/orgapp/the-javascript-engine-for-mini-programs.md
[wecom-guide]: https://developer.work.weixin.qq.com/document/path/92455
[alipay-iot]: https://opendocs.alipay.com/iot/multi-platform/vcs0fv
[feishu-logic]: https://open.feishu.cn/document/client-docs/gadget/framework/logic-layer/overview
[kuaishou-app]: https://open.kuaishou.com/docs/develop/frame/config/conf_appjs.html
[kuaishou-config]: https://open.kuaishou.com/docs/develop/frame/config/conf_appjson.html
[xhs-js]: https://miniapp.xiaohongshu.com/doc/DC159114
[xhs-startup]: https://miniapp.xiaohongshu.com/doc/DC052083
