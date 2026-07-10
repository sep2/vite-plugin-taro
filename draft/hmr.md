# WX Development HMR — Eager Build, Code-Only Refresh

## 1. Decision

WX development uses a complete eager build before WeChat DevTools opens.

After startup:

- JavaScript and TypeScript changes use state-preserving code HMR.
- CSS, WXSS, assets, JSON, configuration, and shell changes perform a normal full rebuild and reload.
- No page or dependency is compiled on first navigation.
- No new project file is created during code HMR.

This intentionally favors a simple and predictable development model over preserving state for every change type.

### Prefer upstream capabilities

Reuse Vite, its environment/module graph and hot-update lifecycle, Rolldown's public build and linking APIs, React Refresh, and WeChat DevTools' `compileHotReLoad` behavior wherever they already provide the required semantics.

Do not invent ad hoc source scanners, import parsers, copied dependency graphs, JavaScript transpilers, module linkers, state serializers, or refresh protocols when an upstream capability can be used directly. Project-owned code should be limited to the unavoidable WX boundary:

- normalizing Rolldown output into literal factories;
- writing executable updates to pre-existing Mini Program files;
- retaining a small module cache because WX cannot execute Vite ESM directly;
- connecting React Refresh to the stable Taro page proxy;
- selecting a conservative full-rebuild fallback.

When upstream behavior is uncertain, add an isolated DevTools probe before adding a workaround. Prefer a full reload over an unproven compatibility layer.

## 2. Required behavior

### Startup

Starting Vite must finish a complete development build containing:

- the App and every configured page;
- all currently reachable JavaScript modules;
- all CSS and WXSS;
- all assets;
- the HMR runtime and initial factory snapshot;
- a pre-existing HMR target for every page.

Only after this build completes is the server ready. Opening `dist/wx` in DevTools must render every page normally without a delayed page activation build, filesystem mutation, or initial refresh.

### Code update

A code-only update must:

- preserve the App Service and native page instance;
- keep unchanged module records and module-level state;
- preserve compatible React state through React Refresh;
- keep the existing Taro page root and native nodes;
- flush the retained Taro root after React commits;
- relaunch the active route when React reports an incompatible family.

### Other updates

The following may rebuild the complete project and reload DevTools state:

- CSS or WXSS;
- images, fonts, media, and other assets;
- app/page JSON and project configuration;
- route-list changes;
- app/bootstrap/runtime changes;
- Vite configuration and environment changes;
- any code edit whose output changes CSS or assets;
- unsupported output such as dynamic chunks.

## 3. Non-goals

This design does not provide:

- demand-driven first-page compilation;
- state preservation for style or asset edits;
- serialization of arbitrary React Fiber state;
- serialization of arbitrary module closures or native handles;
- JavaScript execution from WebSocket strings;
- `eval()` or `new Function()`;
- production tree-shaking semantics in the development runtime;
- state preservation for incompatible React hook signatures.

## 4. Development output

A complete startup build emits stable files such as:

```text
app.js
app.wxss
runtime.js
common.js
vendors.js

__wx_hmr__/runtime.js
__wx_hmr__/initial.js

pages/example/index.js
pages/example/index.hmr.js
pages/example/index.wxml
pages/example/index.wxss
pages/example/index.json
```

`__wx_hmr__/initial.js` and every `*.hmr.js` file must exist before DevTools opens.

Startup assets use ordinary local Mini Program paths. There is no development HTTP asset server.

## 5. Initial snapshot

The server builds all configured page roots together with a fixed entry set.

Use Vite/Rolldown with:

```text
write: false
format: cjs
preserveModules: true
preserveModulesRoot: project root
minify: false
target: es2018
all configured page roots as named inputs
```

Externalize only the immutable host boundary:

```text
react
react/jsx-runtime
react/jsx-dev-runtime
virtual:taro/api
virtual:taro/components
React Refresh runtime
Taro runtime and renderer
WX HMR runtime
```

The normalized JavaScript snapshot contains:

```ts
type WxCodeSnapshot = {
    factories: Map<string, {
        code: string
        hash: string
        imports: string[]
    }>
    roots: Map<string, string>
    importers: Map<string, Set<string>>
    env: Record<string, unknown>
}
```

Module IDs derive from stable preserve-module output paths, not content hashes.

The initial snapshot is emitted as literal factories in `__wx_hmr__/initial.js`. Loading it registers every factory and route root but does not eagerly evaluate every page root.

## 6. Page bootstrap

Every generated page entry is complete on first evaluation.

Conceptually:

```js
const runtime = require('../../__wx_hmr__/runtime')
require('../../__wx_hmr__/initial')
require('./index.hmr')

const route = 'pages/example/index'
runtime.setActiveRoute(route)

if (runtime.claimPageRegistration(route)) {
    Page(createPageConfig(
        runtime.createStablePageProxy(route),
        route,
        initialData,
        pageConfig
    ))
}
```

The initial snapshot already contains the route component, so the stable proxy renders the real component during the normal first React mount. Taro hooks register before the native initial lifecycle is delivered. No lifecycle buffering or replay is needed.

`claimPageRegistration()` is scoped to the current App Service. It returns `true` on a fresh App Service and `false` when DevTools re-evaluates the page bootstrap for HMR.

The bare WeChat fixture must verify that skipping duplicate `Page()` registration is accepted by DevTools. If a DevTools version requires `Page()` on every page-module evaluation, use the same cached proxy/config and rely on DevTools' state-preserving page update instead of introducing lifecycle replay.

## 7. HMR target and trigger

Each page imports a stable, pre-existing sibling target:

```text
pages/example/index.hmr.js
```

At startup it is a valid no-op module.

For a code update, the server chooses the currently visible page as the transport target and writes the new snapshot to that page's `index.hmr.js`. It then rewrites the existing page bootstrap with an incremented inert generation marker so DevTools re-evaluates the importer last.

Transaction order:

1. Build and validate the complete next JavaScript snapshot in memory.
2. Verify that emitted CSS and asset hashes are unchanged.
3. Write the HMR target to a temporary file outside `dist/wx`.
4. Atomically replace the existing `index.hmr.js`.
5. Rewrite the existing page bootstrap generation marker last.
6. Commit the server snapshot.

No recognized file is created under `dist/wx` during this transaction.

The WebSocket carries only active-route/status metadata. It never transports executable code.

## 8. Self-contained HMR snapshot

`index.hmr.js` contains the complete current JavaScript snapshot, not merely the latest delta:

```js
const runtime = globalThis.__VITE_PLUGIN_TARO_WX_HMR__

runtime.applySnapshot({
    epoch: 'server-epoch',
    version: 7,
    factories: {
        '/src/example.js': function (module, exports, require, importMeta) {
            // ordinary generated CJS
        }
    },
    hashes: {
        '/src/example.js': '...'
    },
    roots: {
        'pages/example/index': '/src/example.js'
    },
    importers: {
        '/src/example.js': []
    },
    env: {}
})
```

A complete snapshot makes the file self-healing after:

- a missed previous update;
- a page-module re-evaluation;
- an App Service refresh;
- direct entry into another page;
- reopening the generated project while the same Vite server is running.

The runtime compares factory hashes and applies only actual changes. The presence of every factory in the transport does not mean every module record is recreated.

## 9. Runtime apply algorithm

For an accepted snapshot:

1. Ignore an already-applied epoch/version.
2. Compare incoming factory hashes with installed hashes.
3. Find added, changed, and removed module IDs.
4. Compute the generated importer invalidation closure using both previous and incoming importer maps.
5. Preserve evaluated records outside that closure.
6. Remove invalidated records.
7. Install changed/new factories and remove deleted factories.
8. Replace route roots, importer metadata, and `import.meta.env`.
9. Retain the active Taro page-root reference.
10. Evaluate the active route root so React Refresh registrations run.
11. Notify the stable page proxy.
12. Run `performReactRefresh()` once.
13. If all families are compatible, flush the retained Taro root after the React commit.
14. If any family is stale, relaunch the active route with its query parameters.

Insert an empty module record before factory execution to support CommonJS cycles.

If factory evaluation fails, keep the previous committed factory/module state where possible, report the error, and request a full rebuild rather than attempting partial state reconstruction.

## 10. State ownership

### React state

React Refresh owns compatible React state. Do not inspect or serialize Fiber internals.

Compatible families preserve:

- `useState` and `useReducer` values;
- refs;
- update queues;
- compatible component identity.

An incompatible hook signature intentionally resets the route through `reLaunch` so Taro receives a complete normal lifecycle.

### Module state

Unchanged factory hashes retain the same evaluated module record and therefore retain module-private state and singleton identity.

A genuinely changed or invalidated module may lose its private state. Automatic serialization of closures, sockets, class instances, promises, and native handles is out of scope.

No `import.meta.hot.data` protocol is required initially. It may be added later as an explicit opt-in if real applications need changed-module state migration.

### Taro state

The runtime retains only the existing Taro page-root reference. After compatible Refresh:

```ts
root.updateChildNodes()
root.performUpdate(true)
```

Do not inspect private input paths, replay input handlers, or restore arbitrary `page.data`.

### Native state

Controlled and uncontrolled inputs, focus, selection, and scroll are preserved when React/Taro/native node identities survive. Add a narrow adapter only for a demonstrated native-state failure; do not build a general native-state serializer preemptively.

## 11. Update classification

A source event is eligible for code HMR only when all of these hold:

- it affects JavaScript/TypeScript application code;
- the App/bootstrap/runtime contract is unchanged;
- the next snapshot has no changed CSS/WXSS output;
- the next snapshot has no changed asset output;
- no unsupported dynamic output is introduced;
- the active page transport is connected.

Otherwise perform a complete development rebuild.

Examples:

| Change | Action |
| --- | --- |
| Component label or calculation logic | Code HMR |
| Add a normal JavaScript npm import | Code HMR |
| Add/remove JavaScript module | Code HMR if output remains JS-only |
| Change CSS/Tailwind/CSS module | Full rebuild |
| Add/change image or font | Full rebuild |
| Change page/app JSON | Full rebuild |
| Change app component/bootstrap | Full rebuild |
| Change route list or Vite config | Full rebuild |

A full rebuild may clear and recreate `dist/wx`; the resulting DevTools reload is intentional.

## 12. Active route

The runtime reports the visible route on native `onShow` and after WebSocket reconnect.

The server uses that route only as the filesystem transport destination. The JavaScript snapshot always describes all configured routes, so a shared-module or inactive-page edit can still be applied through the visible page.

If no page is active, keep the newest in-memory snapshot pending and deliver it on the next active-route report.

## 13. React Refresh instrumentation

Development transforms assign stable Refresh IDs from normalized source paths and local component names.

The initial build and every HMR snapshot must use the same instrumentation and IDs. Registration occurs while evaluating affected route roots. Perform Refresh before the final Taro-root flush.

A stale family is not an error. It is a signal that state compatibility cannot be guaranteed; relaunch the route instead of leaving a partially initialized Taro page.

## 14. Styles and assets

There is no custom style or asset HMR.

Startup and full rebuilds emit ordinary Mini Program files:

```text
app.wxss
pages/**/index.wxss
assets/**
```

Code HMR validation compares non-JavaScript output hashes with the committed full build. If any differ, discard the code-HMR transaction and perform a full rebuild.

This avoids:

- mutable global/page HMR WXSS targets;
- dynamic asset creation after DevTools opens;
- HTTP asset serving;
- CSS-before-JavaScript HMR ordering;
- candidate scanning tied to visited routes.

## 15. Failure and fallback policy

Prefer a complete reload over a complicated partial recovery.

Trigger a full rebuild when:

- snapshot validation fails;
- the active page is unavailable;
- DevTools does not execute the rewritten HMR target;
- a factory throws during apply;
- Refresh reports an unrecoverable error;
- CSS/assets/config output changes;
- the runtime epoch cannot be reconciled;
- an unsupported module form is encountered.

The last successful complete output remains the baseline until the next full build succeeds.

## 16. Why this is sufficient

For a compatible code edit:

- DevTools recompiles only existing page-local JavaScript files.
- `compileHotReLoad: true` preserves the App Service and native page instance.
- The stable proxy preserves the React root.
- React Refresh preserves compatible Fiber state.
- Hash comparison preserves every unchanged evaluated module record.
- The retained Taro root is flushed rather than reconstructed.

Therefore compatible React state, unchanged module state, Taro page identity, and native input state survive.

The matching lower bound is unavoidable: if DevTools destroys the App Service or React root, arbitrary Fiber/closure state cannot be reconstructed generically. In that case the only general behavior is a full reload. Likewise, state inside a genuinely replaced module cannot be guaranteed without module-specific migration logic.

## 17. Implementation layout

```text
src/vite/hmr.ts
    server registration, active-route control, update classification

src/vite/hmr/session.ts
    eager initial build, committed snapshot, code-HMR serialization

src/vite/hmr/snapshot-builder.ts
    complete all-page in-memory JavaScript snapshot

src/vite/hmr/snapshot-diff.ts
    hash and importer invalidation helpers

src/vite/hmr/page-writer.ts
    atomic HMR-target replacement and page trigger rewrite

src/shim/dev-runtime.ts
    Page bootstrap integration and active-route reporting

src/shim/module-runtime.ts
    factories, module cache, snapshot apply, React Refresh

src/shim/taro-page-state.ts
    retained Taro root and post-Refresh flush
```

The redesign should delete obsolete demand-driven components rather than retain compatibility layers.

## 18. Acceptance tests

### Complete cold start

1. Start Vite and wait for readiness.
2. Record all output hashes and mtimes.
3. Open DevTools.
4. Confirm calculator renders completely on the first load.
5. Navigate to every configured page.
6. Confirm no build or output mutation occurs because of navigation.
7. Confirm no initial App Service refresh.

### Compatible React update

1. Enter `123` in a controlled input.
2. Enter `native-only` in an uncontrolled input probe.
3. Produce visible result state.
4. Record `globalThis`, `getApp()`, `$taroPath`, and an unrelated `page.data` field.
5. Change a component label without changing hooks.
6. Confirm every value and identity remains unchanged.
7. Confirm only the active page's existing HMR target and trigger were rewritten.

### Incompatible React update

1. Add or remove a hook.
2. Confirm React reports a stale family.
3. Confirm the active route relaunches once.
4. Confirm the page initializes completely through normal Taro lifecycle.
5. Confirm old incompatible state is intentionally reset.

### Module singleton

1. Store data in an unchanged shared module.
2. Edit a consuming component.
3. Confirm the shared module record and data survive.
4. Edit the shared module itself.
5. Confirm only its invalidation closure is recreated.

### Shared and inactive pages

1. Open two pages sharing a component, then return to one.
2. Edit the shared component.
3. Confirm the visible page refreshes.
4. Navigate to the other page and confirm it uses the updated factory without a first-navigation build.

### Style and asset fallback

1. Change page CSS, global CSS, a CSS module, and an image.
2. Confirm each change performs a complete rebuild and expected full reload.
3. Confirm no custom WXSS or HTTP asset HMR path is used.

### Transport recovery

1. Apply several code updates.
2. Refresh the App Service or directly enter another page.
3. Confirm the latest complete `*.hmr.js` snapshot reconciles directly from the initial baseline without requiring every intermediate version.

### Bare DevTools probes

Maintain the dependency-free `test-wechat-hmr` project to verify:

- `compileHotReLoad: true` preserves page state for existing page JavaScript rewrites;
- rewriting an existing imported JavaScript dependency executes the expected importer path;
- the page-registration guard is accepted during page-module re-evaluation;
- `compileHotReLoad: false` is not used for code HMR.

The design is mostly defined, but several important details remain.

## Correctness blockers

1. **App code must use the same module registry**

The initial snapshot currently describes page roots, but application modules imported by `App` could otherwise be evaluated separately from page modules.

That would recreate the singleton problem:

```text
App bundle → store instance A
Page factory runtime → store instance B
```

The initial snapshot should include an application root too:

```ts
type WxCodeSnapshot = {
    appRoot: string
    pageRoots: Map<string, string>
    factories: ...
}
```

Generated `app.js` should install the initial snapshot and obtain `AppComponent` through the same module runtime used by pages.

2. **DevTools execution behavior needs a bare probe**

Two assumptions are not yet proven:

- rewriting `index.hmr.js` invalidates it when the page bootstrap requires it again;
- skipping duplicate `Page()` registration during page-module re-evaluation is accepted consistently.

Test these combinations:

```text
rewrite dependency only
rewrite dependency then page bootstrap
guard Page()
call Page() again with cached config
```

The architecture must choose the simplest proven combination.

3. **Runtime apply needs acknowledgement**

The server currently considers a transaction committed after writing files, but runtime execution may fail afterward.

Add metadata-only control messages:

```text
server writes version 7
runtime applies version 7
runtime sends applied(7) or failed(7, error)
```

On failure, perform a full rebuild. This is not executable WebSocket transport.

4. **The full snapshot must be size-tested**

Every code update places the complete factory snapshot into one page-local HMR file. This is simple and self-healing, but may become too large for DevTools compilation or Mini Program per-file limits.

Benchmark:

- snapshot size;
- rebuild time;
- file-write-to-refresh latency;
- memory;
- 100, 500, and 1,000 module projects.

If too large, use a baseline-relative cumulative overlay rather than reintroducing demand compilation.

## Operational details

5. **Full-rebuild orchestration**

Define how the server:

- stops code-HMR processing;
- completes the replacement build;
- avoids watching its own `dist/wx` writes;
- resets epoch/version;
- resets every `*.hmr.js` target;
- resumes updates without a restart loop.

6. **Atomic-write behavior**

Renaming a temporary file over an existing `.js` file may be interpreted differently from overwriting it. The bare fixture should compare both because creating/replacing recognized files can affect DevTools reload behavior.

7. **Update classification**

The implementation needs one deterministic classifier:

```ts
if (
    onlyJavaScriptChanged &&
    cssHashesUnchanged &&
    assetHashesUnchanged &&
    configUnchanged &&
    outputSupported
) {
    codeHmr()
} else {
    fullRebuild()
}
```

Classification should use Vite/Rolldown outputs, not source-extension guesses alone.

8. **App and shared-runtime edits**

The draft says app/bootstrap changes reload, but it should precisely classify:

- application `AppComponent` edits;
- generated app bootstrap edits;
- framework/runtime edits;
- shared modules imported by both App and pages.

Application App edits can initially use full reload. Shared application modules must still have one registry identity.

## Recovery and scope

9. **Direct-entry and stale-file cases**

Test:

- direct entry into every page;
- Vite restart while DevTools remains open;
- DevTools reopen with Vite running;
- DevTools reopen without Vite;
- stale `index.hmr.js` from an earlier epoch.

10. **Multiple clients**

Either support multiple DevTools windows independently or explicitly declare one active client per Vite server. A single global `activeRoute` is insufficient for multiple clients.

11. **Stale-family navigation semantics**

`reLaunch` clears the page stack. That is acceptable for a simple fallback but should be stated explicitly. Query parameters are preserved; stack history is not.

## Testing still needed

- Automated bare DevTools trigger/registration matrix.
- React/Taro compatible-state regression.
- Incompatible-hook relaunch.
- App/page shared singleton identity.
- Added/removed npm import.
- Code edit that starts emitting CSS or an asset.
- Full rebuild while DevTools watches the project.
- Snapshot size/performance benchmark.

The most important missing correction is putting **App and pages in the same initial factory registry**. The most important unknown is whether the proposed `index.hmr.js` plus guarded page-bootstrap execution behaves reliably in DevTools.
