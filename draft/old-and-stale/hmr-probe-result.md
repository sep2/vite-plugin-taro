  # Bare WeChat hot-reload probes

Date: 2026-07-14

## `page.js` result

**PASS: automatically hot-reloading an active bare WeChat `page.js` preserved the App instance and its global state.**

The replacement page recovered the exact identity token and value stored by the initial page. It also recovered the same
identity object through both a direct property on `getApp()` and `getApp().globalData`.

## `page.js` scope

The first probe tested one question:

> When `compileHotReLoad` is enabled and the active page's `page.js` is completely rewritten, does the automatically
> reloaded page observe the existing App state or a fresh App instance?

It did not test Page instance retention, `Page.data`, native input state, React state, module-local state, lifecycle order,
dependency update strategies, or manual compilation. App-level and page-level WXSS updates are tested separately below.

## Environment

- Project: `test-wechat-hmr`
- Base library: `3.15.2`
- `compileHotReLoad: true`
- `urlCheck: false`
- Bare WeChat Mini Program without Taro, React, Vite, or an HMR runtime
- Temporary Node HTTP server listening on `localhost` outside the repository

## `page.js` method

1. Close the existing DevTools project window.
2. Write the initial `pages/index/page.js` and start a temporary HTTP server.
3. Open the project once to establish the initial runtime.
4. In the initial page module:
   - read `getApp()`;
   - create an identity object with a random token;
   - store that object directly on the App instance;
   - store the token, identity object, and a value in `getApp().globalData`;
   - POST a `before` event to the HTTP server.
5. Wait until the server receives the `before` event.
6. Hash every file in the project.
7. Completely overwrite only `pages/index/page.js` with a second implementation.
8. Do not invoke refresh, compile, page navigation, or any other DevTools action.
9. Let `compileHotReLoad` detect the saved file and reload it automatically.
10. In the replacement page module:
    - read `getApp()` without restoring or writing probe state;
    - read the App identity and `globalData` written by the initial page;
    - POST an `after` event to the HTTP server.
11. Compare both events and hash every project file again.

A manual `simulator_refresh` is deliberately excluded: it is a separate operation and cannot answer whether the
file-save hot reload itself preserves App state.

## `page.js` observed events

Initial page:

```json
{
    "phase": "before",
    "appToken": "app-instance:1783960539522:936008f8caa988",
    "globalToken": "app-instance:1783960539522:936008f8caa988",
    "sameIdentityObject": true
}
```

Automatically reloaded replacement page:

```json
{
    "phase": "after",
    "appToken": "app-instance:1783960539522:936008f8caa988",
    "globalToken": "app-instance:1783960539522:936008f8caa988",
    "savedValue": "saved-before-page-js-rewrite",
    "sameIdentityObject": true
}
```

The replacement page therefore observed all of the following:

- the same direct App identity token;
- the same `globalData` identity token;
- the value stored before the rewrite;
- the same shared identity object through the App property and `globalData`.

## `page.js` file-isolation check

The SHA-256 comparison across the automatic hot reload changed one file only:

```text
pages/index/page.js
98760b70187264266cd17ff314b41e22fef2ca5402ccd7577576a10c200172ed
    -> d54cbfd8a51fd0c6b69209de6c1d292fe7ddc245f17ad486f4d35d15f9d084cd
```

Every other project file retained the same hash. The HTTP server and its event log were created under `/tmp`, not in the
repository, and the server was stopped after the probe.

## `page.js` conclusion

A bare active-page `page.js` file-save hot reload does **not** discard the App state in the tested DevTools environment.
The replacement page continues to observe the existing App-attached identity and `globalData`.

This result is limited to App-state retention for an automatically detected `page.js` rewrite. It should not be
generalized to manual refreshes, changes to `app.js` or JSON configuration, Page-local state, native view state, or
framework-level HMR behavior.

## WXSS App-state probes

### Scope and method

The follow-up probes tested App-state retention for two isolated automatic updates:

1. change only `app.wxss`;
2. change only `pages/index/page.wxss`.

The page created a random identity object and stored it both directly on `getApp()` and in `getApp().globalData`. It also
created separate module and Page-instance tokens. Every 750 ms it queried the computed colors of `#phase` and `#result`
and sent the styles, tokens, saved state, and heartbeat sequence to a temporary HTTP server.

A changed computed color proved that DevTools had applied the saved WXSS file. Comparing the heartbeat before and after
that color transition showed whether the App, page module, or Page instance had been replaced. No refresh, compile,
navigation, or other DevTools action was invoked after either file write. SHA-256 snapshots verified that only the target
WXSS file changed in each probe.

The page seeded an identity only when both App-held probe values were absent. A new identity after an update therefore
means the previous App state was unavailable and a fresh state was created; the constant sample value is not itself used
as proof of retention.

### `app.wxss`

The `#phase` color changed automatically:

```text
rgb(17, 34, 51) -> rgb(68, 85, 102)
```

The runtime identity changed at the same time:

| Signal | Before | After | Retained |
| --- | --- | --- | --- |
| App/global token | `app-instance:1783961645154:e1dc51ef31c8c` | `app-instance:1783961679362:4be437988dcfb` | no |
| Page module token | `page-module:1783961645154:c1219dd46ba158` | `page-module:1783961679362:f648014ff43178` | no |
| Page instance token | `page-instance:1783961645812:a38c5061a27668` | `page-instance:1783961679405:74c545a05fd67` | no |
| Heartbeat sequence | `31` | `1` | reset |

The App and `globalData` identity changed, while the page module restarted and the Page instance was replaced. Therefore,
**changing only `app.wxss` reloaded the App and lost the existing App state**.

The file-isolation hashes were:

```text
app.wxss
ae3f2c27c46ec2380b55436f76ba10ee089e4f3c53147d937c3e18fa593c6944
    -> 1405228f966079093865ff721d36fdcf10b25c6101606b2ef6ed5375c4f2aaa5
```

Every other project file retained the same hash.

### `pages/index/page.wxss`

The `#result` color changed automatically:

```text
rgb(119, 136, 153) -> rgb(170, 187, 204)
```

The runtime identity remained stable:

| Signal | Before | After | Retained |
| --- | --- | --- | --- |
| App/global token | `app-instance:1783961679362:4be437988dcfb` | `app-instance:1783961679362:4be437988dcfb` | yes |
| Page module token | `page-module:1783961679362:f648014ff43178` | `page-module:1783961679362:f648014ff43178` | yes |
| Page instance token | `page-instance:1783961679405:74c545a05fd67` | `page-instance:1783961679405:74c545a05fd67` | yes |
| Heartbeat sequence | `50` | `64` | continued |

The same App identity, `globalData`, page module, Page instance, and heartbeat remained live while the style changed.
Therefore, **changing only page-level WXSS applied the style without reloading the App or losing App state**.

The file-isolation hashes were:

```text
pages/index/page.wxss
51234b81e17fd1e12e732215109e75a4058035b02a8ff0d0632584ea52d611b2
    -> e4550a55eb0dd684bc34c68ddf1455bf9d4b5caa20e9bd917d08ecfa2cf68486
```

Every other project file retained the same hash.

## Summary

| Changed file | App replaced | App state |
| --- | --- | --- |
| `pages/index/page.js` | no | preserved |
| `app.wxss` | yes | lost |
| `pages/index/page.wxss` | no | preserved |

These results cover only automatically detected saves with `compileHotReLoad: true`; they do not describe manual compile
or refresh behavior.
