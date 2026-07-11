# WX development HMR

This document describes the implementation. It is not a roadmap.

## Design goal

Provide useful React HMR in WeChat DevTools without reproducing Vite's development server in the App Service.
The implementation deliberately favors a complete, readable update path over fine-grained module preservation.

## Architecture

There are four pieces:

1. an eager Vite/Rolldown build;
2. one shared watched file, `__wx_hmr__/update.js`;
3. a small CommonJS factory loader;
4. a WeChat/Taro adapter around React Refresh and page lifecycles.

### Eager build

Before Vite reports ready, the `wx_hmr` environment builds the App component and every configured page. Rolldown emits
preserve-modules CommonJS in memory. The plugin converts each chunk into a literal factory:

```js
function (module, exports, require) {
    // Rolldown output
}
```

The initial factory set is embedded in the normal App/page output. This means first navigation never starts a build.

### Shared update file

Every generated page imports the same existing file:

```text
__wx_hmr__/update.js
```

It starts as a no-op. For a code update the plugin overwrites it with literal JavaScript that calls
`applySnapshot(...)`. There is no `eval`, `new Function`, executable WebSocket payload, or per-page transport.

### Update classification

For every Vite hot-update event, the plugin rebuilds the in-memory snapshot and compares outputs:

- no output difference: do nothing;
- JavaScript-only difference: write `update.js`;
- changed CSS or emitted assets: run a complete WX build;
- changed public asset: run a complete WX build.

This is output-based rather than source-extension-based, so it also works with code produced by other Vite plugins.

## Runtime behavior

The runtime has one factory map and one CommonJS module cache for the App and all pages. Bare imports such as React and
Taro resolve to host modules supplied by `dev-runtime.ts`.

On every accepted code update the runtime:

1. replaces the complete factory map;
2. clears evaluated application modules;
3. evaluates the App and every page root that has already been loaded;
4. runs React Refresh;
5. asks stable page proxies to render the current implementations;
6. flushes the retained active Taro page root.

Clearing the whole application cache is intentional. Module-local singleton state resets on an update. Compatible React
component state is preserved by React Refresh, which is the state users normally expect HMR to retain. This removes the
need for a copied dependency graph, hash-based runtime invalidation, graph rollback, or module migration protocol.

CommonJS records are cached before factory execution so ordinary cycles continue to work.

## React Refresh

Application TS/JS modules are instrumented with the official `react-refresh/babel` transform. A small bootstrap installs
the Refresh runtime before Taro initializes its React renderer.

If Refresh reports an incompatible family, such as a changed Hook signature, the adapter relaunches the active route.
The route query is preserved, but incompatible component state intentionally resets.

## WeChat and Taro adapter

`shim/dev-runtime.ts` contains the platform-specific behavior:

- stable React page proxies;
- stable native `Page(...)` registration;
- active-page tracking;
- Taro root capture and flush;
- incompatible-family route relaunch;
- suppression of DevTools' synthetic lifecycle sequence.

DevTools emits synthetic page lifecycle calls when `update.js` changes. The adapter ignores lifecycle calls for the update
task so they cannot mount a second Taro root. Normal navigation outside that task remains unchanged.

The small Taro root adapter uses `updateChildNodes()` and `performUpdate(true)` because Taro does not expose a public API
for flushing an already-mounted mini-program page.

## Full-rebuild boundary

A complete rebuild is used for CSS, Tailwind output, images, fonts, public assets, and application configuration. These
outputs are owned by the normal WX build and are not patched independently.

The resulting DevTools state reset is intentional. Keeping a partial CSS or asset protocol would add substantially more
code than value.

## Files

```text
src/vite/hmr/session.ts       eager build, output comparison, update writes
src/vite/hmr/snapshot.ts      Rolldown output to literal factories
src/vite/targets/wx.ts        WX target plugin and React Refresh instrumentation
src/shim/module-runtime.ts    factory loader and Refresh application
src/shim/dev-runtime.ts       WeChat/Taro integration
```

## Expected behavior

| Change | Result |
| --- | --- |
| Compatible App/page component edit | React Refresh; component state and native page survive |
| New reachable JavaScript dependency | Included in the next complete factory snapshot |
| Inactive page edit | Available immediately when navigating to that page |
| Changed Hook signature | Active route relaunches; incompatible state resets |
| CSS/Tailwind change | Complete WX rebuild |
| Image/font/public asset change | Complete WX rebuild |
| App/page configuration change | Complete WX rebuild or Vite restart |
| Unchanged generated output | No update file write |

Development output enables WeChat's `compileHotReLoad` option because DevTools requires it to retain native page state
while re-evaluating the imported update file.
