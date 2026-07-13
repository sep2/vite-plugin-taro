# Bare WeChat `page.js` hot-reload probe

Date: 2026-07-14

## Result

**PASS: automatically hot-reloading an active bare WeChat `page.js` preserved the App instance and its global state.**

The replacement page recovered the exact identity token and value stored by the initial page. It also recovered the same
identity object through both a direct property on `getApp()` and `getApp().globalData`.

## Scope

This probe tested one question only:

> When `compileHotReLoad` is enabled and the active page's `page.js` is completely rewritten, does the automatically
> reloaded page observe the existing App state or a fresh App instance?

It did not test Page instance retention, `Page.data`, native input state, React state, module-local state, lifecycle order,
other file types, dependency update strategies, or manual compilation.

## Environment

- Project: `test-wechat-hmr`
- Base library: `3.15.2`
- `compileHotReLoad: true`
- `urlCheck: false`
- Bare WeChat Mini Program without Taro, React, Vite, or an HMR runtime
- Temporary Node HTTP server listening on `localhost` outside the repository

## Method

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

## Observed events

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

## File-isolation check

The SHA-256 comparison across the automatic hot reload changed one file only:

```text
pages/index/page.js
98760b70187264266cd17ff314b41e22fef2ca5402ccd7577576a10c200172ed
    -> d54cbfd8a51fd0c6b69209de6c1d292fe7ddc245f17ad486f4d35d15f9d084cd
```

Every other project file retained the same hash. The HTTP server and its event log were created under `/tmp`, not in the
repository, and the server was stopped after the probe.

## Conclusion

A bare active-page `page.js` file-save hot reload does **not** discard the App state in the tested DevTools environment.
The replacement page continues to observe the existing App-attached identity and `globalData`.

This result is intentionally limited to App-state retention for an automatically detected `page.js` rewrite. It should
not be generalized to manual refreshes, changes to `app.js` or JSON configuration, Page-local state, native view state,
or framework-level HMR behavior.
