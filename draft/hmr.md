# Greenfield WX HMR Implementation Plan

> This document is normative. Implement the architecture described here rather than preserving the current HMR internals.

## 1. Objective

Implement adaptive, state-preserving HMR for WeChat Mini Programs using Vite 8 as the source of truth for module processing and graph topology.

The design must provide these properties:

- No `eval()`, `new Function()`, or JavaScript execution from WebSocket strings.
- No eager crawl or factory compilation for pages that have not been accessed.
- No development-shell rebuild when a page is first accessed.
- No App Service restart for a normal page activation or hot update.
- A page may render `null` while its first payload is compiled.
- Every page activation uses the same append-only HMR transaction as later edits.
- Vite owns resolution, transformation, and module graph relationships.
- React Refresh preserves compatible React state.
- Taro page identity and controlled input values remain stable.
- CSS/WXSS and assets are committed before JavaScript that references them.

## 2. Fundamental model

A browser populates Vite's graph by requesting modules. WX cannot request and execute ESM over HTTP, so a small runtime reports observable page access instead.

```text
WX page shell executes
    -> stable proxy registers and renders null
    -> runtime reports the route through the Vite WebSocket
    -> server asks Vite to process that route
    -> Vite/Rolldown creates an executable snapshot
    -> server writes styles/assets
    -> server appends literal factories to the active page entry
    -> runtime installs the factories
    -> stable proxy rerenders the real page component
```

The first page payload is a full HMR payload, not a special bootstrap. Later payloads are deltas produced by comparing Vite build snapshots.

## 3. Non-negotiable invariants

### Immutable development shell

During one Vite server session, these JavaScript files must not be rewritten by page activation or ordinary HMR:

```text
app.js
runtime.js
taro.js
vendors.js
common.js
comp.js
```

The shell may be rebuilt when Vite itself restarts because configuration, environment files, plugin code, or the immutable runtime contract changed.

### Append-only executable transport

Executable updates are delivered only by appending ordinary JavaScript to:

```text
pages/<active-route>.js
```

The WebSocket carries control and synchronization metadata only.

### Fixed host boundary

The shell statically provides only dependencies that are part of the immutable runtime contract:

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

Application modules and ordinary npm packages are part of Vite's dynamic snapshot. Adding an npm import must not require rebuilding `app.js`.

### Vite-owned graph

Do not create persistent custom `importers`, `dependencies`, or source graph maps. Use:

```text
EnvironmentModuleNode.importedModules
EnvironmentModuleNode.importers
EnvironmentModuleGraph.getModulesByFile()
HotUpdateOptions.modules
```

A local snapshot manifest for emitted chunks is allowed. It describes generated artifacts, not source topology.

## 4. High-level architecture

### Server

```text
src/vite/hmr.ts
    Vite plugin entry and environment registration

src/vite/hmr/session.ts
    serialized page access and update transactions

src/vite/hmr/vite-graph.ts
    thin traversal helpers over EnvironmentModuleGraph

src/vite/hmr/snapshot-builder.ts
    in-memory Vite/Rolldown multi-entry preserve-modules build

src/vite/hmr/snapshot.ts
    snapshot types and output normalization

src/vite/hmr/snapshot-diff.ts
    changed factories, removals, roots, and invalidation closure

src/vite/hmr/style-writer.ts
    global and page-local WXSS transaction output

src/vite/hmr/asset-writer.ts
    deterministic asset output

src/vite/hmr/page-transport.ts
    append-only page JavaScript transport

src/vite/hmr/protocol.ts
    WebSocket and filesystem payload types
```

### Mini Program runtime

```text
src/shim/dev-runtime.ts
    runtime composition and generated Page wrappers

src/shim/module-runtime.ts
    factory registry, relative require, cache, subscriptions, Refresh

src/shim/wx-hmr-client.ts
    page access, synchronization, prepare/ready handshake

src/shim/taro-page-session.ts
    live/prepared/ignored page lifecycle state

src/shim/taro-input-state.ts
    controlled input capture and restoration
```

## 5. Vite environments

Register a dedicated development environment named `wx-hmr` in the plugin `config` hook.

```ts
environments: {
    'wx-hmr': {
        consumer: 'client'
    }
}
```

Use this environment for page graph processing. Do not use deprecated server-wide module graph or plugin-container APIs.

The HMR plugin must use Vite 8's environment-aware `hotUpdate` hook:

```ts
async hotUpdate(options) {
    if (this.environment.name !== 'wx-hmr') return
    await session.handleHotUpdate(this.environment, options)
    return []
}
```

The plugin performs all WX update delivery, so Vite's browser HMR propagation must not send a competing update for this environment.

## 6. Demand-driven graph processing

### Page roots

Map configured routes to their source URLs:

```ts
route -> toImportPath(createPageComponentFile(route))
```

No page root is processed at server startup.

### Page access

When a route is reported:

1. Call `environment.transformRequest(rootUrl)`.
2. Read the root node with `environment.moduleGraph.getModuleByUrl(rootUrl)`.
3. Recursively call `transformRequest()` for reachable application modules that have not been processed.
4. Follow Vite's `importedModules`; do not parse imports to build another topology.
5. Add the route to the activated-root set only after processing succeeds.

The traversal helper may keep a local `seen` set for one operation. It must not persist copied edges.

### Activated closure

At any time, derive the active source closure by traversing Vite nodes from activated roots. This derived set is used to decide whether a changed file affects a loaded page.

Edits to modules outside the activated closure are ignored until a route requiring them is accessed.

## 7. Minimal page shell

Every generated page entry has the same shape. It never imports the page component and never requires a mutable bootstrap file.

Conceptually:

```js
import { createWxDevPageConfig, getWxDevRuntime } from 'vite-plugin-taro/dev-runtime'
import { createPageConfig } from 'vite-plugin-taro/wx-shim'
import React from 'react'

const route = 'pages/example/index'
getWxDevRuntime().reportPageAccess(route)

Page(createWxDevPageConfig({
    route,
    data: { root: { cn: [] } },
    pageConfig,
    createPageConfig,
    React
}))
```

The top-level report reduces cold-start latency. `onLoad` and `onShow` must report again so reconnects and App Service restarts self-heal. Reports are idempotent.

Every page starts with an empty page-local WXSS target generated by the shell.

## 8. Stable proxy and runtime subscription

A page proxy is keyed by route rather than a compile-time component module ID.

```tsx
function WxDevPageProxy(props) {
    React.useSyncExternalStore(runtime.subscribe, runtime.getRevision, runtime.getRevision)

    const Component = runtime.getPageComponent(route)
    if (!Component) return null
    return React.createElement(Component, props)
}
```

Requirements:

- `getPageComponent(route)` returns `undefined` until a snapshot supplies the route root.
- `runtime.apply()` increments a revision after every accepted full or delta payload.
- Subscribers are notified after factories, roots, and invalidations are committed.
- Module evaluation errors remain visible; only a missing route root renders `null`.

This subscription is what turns first page activation into ordinary HMR instead of a shell reload.

## 9. Fixed external registry

The shell registers fixed modules as ESM namespace records. Each record must be normalized with a non-enumerable `__esModule: true` marker so Rolldown's CommonJS interop recognizes it.

Do not add page-specific dependencies to this registry.

The snapshot build must fail with a clear diagnostic if its generated chunks contain an unresolved bare import that is neither:

- one of the fixed externals; nor
- another emitted snapshot chunk.

## 10. Snapshot build

### Purpose

A snapshot is the complete generated state for all currently activated page roots. It is rebuilt in memory after activation or an applicable source change, then compared with the previous snapshot.

### Vite build configuration

Use a public Vite build API with:

```text
write: false
minify: false
target: es2018
format: cjs
preserveModules: true
preserveModulesRoot: project root
code splitting enabled
hashed chunk names disabled
source maps optional during initial implementation
```

Use all activated page roots as named inputs. Names must derive deterministically from routes.

Externalize only the fixed host boundary. Bundle or preserve every other JavaScript dependency, including ordinary npm dependencies.

Disable Rolldown debug information that can emit NUL-containing virtual IDs into WX JavaScript.

### Project configuration

The snapshot build must honor:

- project aliases;
- Taro conditional directives;
- user Vite transforms that apply to application modules;
- TypeScript and JSX transformation;
- Taro virtual-module resolution;
- WX asset URL behavior;
- WX Tailwind class rewriting;
- CSS and CSS-module processing.

Refactor target plugins to be environment-aware rather than communicating through process-global environment variables.

The ordinary WX shell output hooks must not execute in the snapshot environment.

### Output module IDs

Use normalized output chunk file names as runtime module IDs:

```text
/__wx_hmr__/src/pages/example/index.js
/__wx_hmr__/src/components/button.js
/__wx_hmr__/node_modules/clsx/dist/clsx.js
/__wx_hmr__/_virtual/rolldown-runtime.js
```

Names must remain stable while the underlying source module path remains stable.

### Relative `require()`

Wrap every CJS output chunk as a literal factory:

```js
function (module, exports, require, importMeta) {
    // unchanged Rolldown CJS chunk code
}
```

The runtime passes a parent-bound `require` implementation:

- relative specifier: resolve against the parent factory ID with POSIX path rules;
- fixed bare specifier: read from the external registry;
- anything else: throw a module-not-found error containing parent and specifier.

Do not regex-rewrite generated Rolldown interop helpers.

### Root mapping

The snapshot records:

```ts
Map<route, runtimeModuleId>
```

Derive roots from named entry chunks, not filename guessing.

## 11. React Refresh instrumentation

Every application source module must register component families with its normalized source ID, not the page bundle or output chunk ID.

Configure Oxc React Refresh transformation for application JSX/TSX. Add an environment-specific post-transform that supplies module-local helpers:

```js
const $RefreshReg$ = (type, name) =>
    globalThis.__VITE_PLUGIN_TARO_WX_HMR__.registerRefresh(sourceId, type, name)
const $RefreshSig$ = () =>
    globalThis.__VITE_PLUGIN_TARO_WX_HMR__.createRefreshSignature()
```

Because the prelude is injected per source module before Rolldown linking, Rolldown can rename local helpers without losing source identity.

Exclude node_modules and generated runtime modules from Refresh instrumentation.

The Refresh global hook must be installed before Taro creates its React reconciler.

## 12. Snapshot representation

Define explicit serializable/build-time types:

```ts
type WxHmrChunk = {
    id: string
    code: string
    hash: string
    imports: string[]
    dynamicImports: string[]
    sourceId?: string
}

type WxHmrAsset = {
    fileName: string
    source: string | Uint8Array
    hash: string
}

type WxHmrRouteStyle = {
    route: string
    wxss: string
    hash: string
}

type WxHmrSnapshot = {
    roots: Map<string, string>
    chunks: Map<string, WxHmrChunk>
    assets: Map<string, WxHmrAsset>
    styles: Map<string, WxHmrRouteStyle>
    importers: Map<string, Set<string>>
}
```

`importers` here is generated-output metadata derived fresh from the Vite/Rolldown output. It is not a second source module graph.

Use SHA-256 or another stable Node hash over exact output content. Do not use timestamps for change detection.

## 13. Snapshot diff

Given previous and next snapshots, compute:

```ts
type WxHmrSnapshotDiff = {
    factories: Map<string, string>
    invalidate: Set<string>
    remove: Set<string>
    changedAssets: Map<string, WxHmrAsset>
    changedStyles: Map<string, WxHmrRouteStyle>
    roots: Map<string, string>
}
```

### Changed factories

A chunk is changed when:

- it is new; or
- its exact code hash changed.

Only changed/new factories are transported for a same-epoch delta.

### Invalidation

Start with changed and removed chunk IDs. Walk transitive generated importers using the union of previous and next importer maps. Include affected route roots.

This is required because CJS output captures imported exports when a module evaluates. Invalidating only the changed leaf is insufficient.

### Removed factories

A chunk is removed when it existed previously and does not exist in the next activated-root snapshot. Remove its evaluated module and factory after invalidation begins.

Do not delete emitted assets during a server session. A mounted hidden page may still reference an older asset URL. Clean assets only when the Vite server restarts and rebuilds the shell.

## 14. Styles and assets

### Transaction ordering

For every update:

1. Build and validate the complete next snapshot.
2. Write changed assets.
3. Write changed global/page WXSS.
4. Prepare the active page lifecycle.
5. Append the JavaScript payload last.
6. Commit the server snapshot only after append succeeds.

JavaScript must never observe an asset or class name that has not been written yet.

### Global HMR WXSS

The immutable shell's `app.wxss` imports a stable development file:

```css
@import "/__wx_hmr__/global.wxss";
```

Create that file empty during shell build. The snapshot style compiler may rewrite it without touching `app.wxss`.

Use it for generated global Tailwind utility rules and other activated-source global styles.

### Route WXSS

Each static page WXSS imports a stable route-specific HMR file:

```css
@import "./index.hmr.wxss";
```

Create it empty in the shell. Rewrite it with the complete current CSS closure for that route.

Use Vite's build manifest to associate entry routes with emitted CSS. Do not depend on undocumented `viteMetadata` fields.

Run emitted CSS through the same `weapp-tailwindcss`/WX selector conversion as production output. JavaScript class rewriting and WXSS generation must share one candidate mapping per snapshot.

### CSS modules

CSS-module class maps remain JavaScript modules in the snapshot. Their corresponding CSS is written to route WXSS before the JavaScript delta is appended.

### Assets

Write Vite-emitted assets under deterministic WX-safe paths, for example:

```text
__wx_hmr__/assets/<name>-<content-hash>.<ext>
```

Generated JavaScript must reference Mini Program paths, not HTTP Vite URLs.

## 15. Protocol

### Control events

```ts
const wxHmrEvents = {
    pageAccess: 'vite-plugin-taro:wx-page-access',
    preparePage: 'vite-plugin-taro:wx-prepare-page',
    pageReady: 'vite-plugin-taro:wx-page-ready'
}
```

### Page access

Client to server:

```ts
type WxHmrPageAccessMessage = {
    route: string
    epoch?: string
    version: number
}
```

Send from:

- page entry evaluation;
- `onLoad`;
- `onShow`;
- WebSocket reconnect.

### Prepare and acknowledgement

Server to client:

```ts
type WxHmrPreparePageMessage = {
    route: string
    transactionId: string
}
```

Client marks the route prepared before replying:

```ts
type WxHmrPageReadyMessage = {
    transactionId: string
}
```

Compile and write assets/styles before sending `preparePage`. The only operation after acknowledgement should be appending already-generated JavaScript.

Use a bounded acknowledgement timeout. Client preparation must also expire so append failure cannot leave a route permanently prepared.

## 16. Filesystem payload

Each appended suffix contains literal factories and metadata:

```js
/* vite-plugin-taro wx HMR payload */
;(function () {
    const runtime = globalThis.__VITE_PLUGIN_TARO_WX_HMR__
    runtime.apply({
        "/__wx_hmr__/src/pages/example/index.js": function (module, exports, require, importMeta) {
            // Rolldown CJS output
        }
    }, {
        epoch: "server-epoch",
        version: 7,
        mode: "delta",
        roots: {
            "pages/example/index": "/__wx_hmr__/src/pages/example/index.js"
        },
        invalidate: [],
        remove: [],
        env: {}
    })
})()
```

No source string is evaluated at runtime. WeChat parses the factory functions as ordinary page JavaScript.

## 17. Epoch, version, and resynchronization

Generate a random server epoch when the Vite server starts.

Payload identity is:

```text
(epoch, monotonically increasing version)
```

### Same epoch

Ignore a payload when its version is less than or equal to the runtime version.

### Different epoch

A delta from another epoch is ignored. A full payload from the configured current epoch resets:

- factories;
- evaluated modules;
- roots;
- old version state.

Fixed externals and the mounted stable page proxies remain.

### Full synchronization

Send a full snapshot through the same append transport when:

- a route is activated for the first time;
- the client reports a different epoch;
- the client version is behind and the server cannot prove that all missing deltas are present in that page file;
- the runtime reports a missing factory.

A full payload contains every current snapshot factory. It is still a normal HMR transaction and must not rebuild the shell.

This allows App Service refreshes and direct entry into any page to self-heal even though previous deltas may have been appended to a different active page file.

## 18. Runtime apply algorithm

For an accepted payload:

1. Determine whether this is first activation, same-epoch delta, or full resync.
2. Capture active Taro input state when a live page exists.
3. Delete evaluated module records in `invalidate`.
4. Remove factories in `remove`.
5. Install incoming factories.
6. Update route roots and `import.meta.env`.
7. Evaluate mounted/active route roots so Refresh registrations run.
8. Increment the external-store revision and notify page proxies.
9. Schedule one `performReactRefresh()` for the transaction.
10. Restore captured input state after React and Taro commits.

Insert an empty module record before factory execution to support CommonJS cycles.

If factory evaluation fails:

- remove only the failed evaluated record;
- retain the previous committed server snapshot;
- report the error visibly;
- request a full synchronization on the next page-access report.

## 19. Page lifecycle preservation

Keep the prepared/live/ignored state machine.

When DevTools notices an appended suffix, it may create a phantom page instance. The prepare/ready handshake must be active before append so wrappers can:

- suppress phantom `onLoad` initialization;
- suppress matching `onReady`, `onShow`, `onHide`, and `onUnload`;
- retain the actual live Taro page root;
- distinguish a real navigation unload by checking `getCurrentPages()` after a delay.

Do not replace this with timing-only sleeps.

## 20. Controlled input preservation

Retain the isolated Taro adapter.

Before module invalidation, capture input values by stable Taro `_path`, using serialized `p25` where available.

After Refresh:

1. invoke the latest React `onInput` handler;
2. update matching Taro `p25` page data;
3. flush child nodes;
4. call `performUpdate(true)`.

Do not spread these private Taro fields into the generic module runtime.

## 21. Update handling

### Page access

If the route is not activated:

1. process it in the Vite environment;
2. add it to the candidate activated-root set;
3. build the next snapshot;
4. diff against current snapshot;
5. send a full payload to the accessed route;
6. commit activation and snapshot after append succeeds.

If already activated:

- compare client epoch/version;
- send nothing when synchronized;
- otherwise append a full synchronization payload.

### Source update

In `hotUpdate`:

1. Serialize through the session queue.
2. If none of `options.modules` is in the activated Vite closure, return `[]` without building.
3. Reprocess affected nodes with `environment.transformRequest()`.
4. Process newly reachable imported modules through Vite.
5. Build the next snapshot for all activated roots.
6. Diff snapshots.
7. If the diff is empty, return `[]`.
8. Write assets/styles.
9. Prepare the active page.
10. Append the delta.
11. Commit the next snapshot.

Structural import, external, asset, and style changes are ordinary snapshot diffs. Do not regenerate the shell merely because graph shape changed.

### App/config update

The application component and immutable shell are outside the page snapshot contract. Let Vite restart/rebuild the development shell when these change.

## 22. Serialization and failure atomicity

All page access and hot updates use one promise queue.

```ts
private enqueue<T>(task: () => Promise<T>): Promise<T>
```

The queue must recover after rejection and continue accepting later tasks.

A transaction is committed only after:

- Vite build succeeded;
- snapshot validation succeeded;
- assets and styles were written;
- prepare acknowledgement completed or timed out safely;
- JavaScript append succeeded.

Never increment the committed server version or replace the committed snapshot before that point.

## 23. Dynamic imports

Do not claim dynamic-import support until verified against Rolldown's CJS preserve-modules output.

Initial implementation behavior:

- detect emitted `dynamicImports`;
- fail page activation with a clear unsupported diagnostic;
- leave the proxy blank and retryable.

A later implementation may support them if Rolldown emits a Promise-based call that can use already-installed factories without dynamic code evaluation.

## 24. Development file growth

Page entries grow append-only during a Vite session.

At Vite server startup:

- rebuild the immutable shell;
- clean old appended page suffixes;
- create empty HMR WXSS targets;
- start a new epoch.

Do not compact page JavaScript during a running session because rewriting it may restart App Service.

## 25. Mandatory feasibility probes

Run these probes before implementing the full architecture. Store scripts/results outside committed generated output.

### Probe A: blank proxy activation

- Register a page with a proxy returning `null`.
- Append a literal factory later.
- Notify `useSyncExternalStore` subscribers.
- Verify the real component appears without App Service restart.

Stop if a loaded WX page cannot rerender from an appended factory.

### Probe B: WXSS-only update

- Keep global and App probes.
- Rewrite an imported global HMR WXSS file.
- Rewrite an active page HMR WXSS file.
- Verify styles apply without changing probes or `$taroTimestamp`.

Stop if WXSS updates restart App Service. The no-shell-rebuild style design would not be valid.

### Probe C: preserve-modules CJS snapshot

Build a fixture covering:

- default imports;
- named imports;
- namespace imports;
- re-exports;
- circular imports;
- shared modules across two entries;
- a normal npm dependency;
- CSS modules;
- image assets.

Verify stable chunk names, relative `require()` behavior, root mapping, manifest CSS, and no unresolved imports.

### Probe D: React Refresh IDs

Build two source modules exporting components. Change one component while preserving its hook signature. Verify source-scoped registrations and preserved `useState` after a snapshot delta.

Do not continue to application integration until all four probes pass.

## 26. Implementation phases

### Phase 1: Protocol and types

- Add epoch/version/full/delta payload types.
- Add page-access and prepare/ready message types.
- Add snapshot and diff types.
- Add runtime module-ID and route-root conventions.

### Phase 2: Immutable shell

- Generate blank-capable page entries.
- Register fixed externals.
- Add empty global and route HMR WXSS imports.
- Remove page component imports and mutable bootstraps from page entries.

### Phase 3: Runtime

- Implement route-root lookup.
- Implement external-store subscription.
- Implement parent-relative `require()`.
- Implement epoch/version validation.
- Implement full and delta apply.
- Integrate React Refresh, page sessions, and input restoration.

### Phase 4: Vite environment

- Register `wx-hmr`.
- Implement route `transformRequest()` processing.
- Implement activated closure checks using Vite nodes.
- Switch to environment-aware `hotUpdate`.

### Phase 5: Snapshot builder

- Build activated roots with Vite/Rolldown in memory.
- Normalize chunks, roots, imports, assets, and manifest CSS.
- Inject source-scoped Refresh helpers.
- Validate fixed externals and dynamic imports.

### Phase 6: Diff and transport

- Hash outputs.
- Compute changed factories, removals, and importer invalidation.
- Generate literal payload suffixes.
- Append only after non-JS output succeeds.

### Phase 7: Style and asset transactions

- Implement global HMR WXSS.
- Implement route HMR WXSS.
- Implement CSS-module correspondence.
- Write content-hashed assets without in-session deletion.

### Phase 8: Resynchronization

- Report runtime epoch/version on every page access.
- Send full snapshot on mismatch.
- Verify direct entry and App Service refresh self-heal.

### Phase 9: Remove obsolete implementation

After all acceptance tests pass:

- delete custom source graph topology;
- delete per-page initial `.hmr.js` bootstraps;
- delete shell regeneration for page graph/style/external changes;
- delete generated-code interop regexes;
- remove legacy `handleHotUpdate` usage;
- remove process-global nested-build configuration.

## 27. Acceptance tests

### Cold page

1. Start WX development.
2. Confirm no page source closure was processed before access.
3. Open calculator.
4. Confirm a blank page appears briefly without errors.
5. Confirm one full payload is appended to calculator page JS.
6. Confirm calculator renders without changing `app.js` or shared chunks.

### Unvisited page

1. Do not visit history.
2. Edit history source.
3. Confirm no snapshot build and no page append.
4. Visit history.
5. Confirm the latest source is included in its activation payload.

### Repeated HMR

1. Enter `999` in `贷款金额`.
2. Record probes on `globalThis`, `getApp()`, and `$taroTimestamp`.
3. Apply at least three label updates.
4. Confirm all probes and input remain unchanged.
5. Confirm only the active page JS grows.

### New dependency

1. Add an import of a normal npm package to an activated page.
2. Confirm the next snapshot emits it as a factory/chunk.
3. Confirm no shell or App Service restart.

### Styles

1. Add a new Tailwind class.
2. Edit a CSS module.
3. Edit a page stylesheet.
4. Confirm WXSS is written before JavaScript append.
5. Confirm state probes remain unchanged.

### Assets

1. Add and replace an image import.
2. Confirm content-hashed assets are written first.
3. Confirm rendered URLs are WX paths.
4. Confirm old assets remain until server restart.

### Shared component

1. Activate two pages importing the same component.
2. Edit the component while one page is active and the other hidden.
3. Confirm one shared factory identity.
4. Confirm both pages use the updated component when shown.

### Resynchronization

1. Activate multiple pages and apply updates while alternating active routes.
2. Refresh App Service or directly enter another route.
3. Confirm epoch/version report causes a full snapshot append.
4. Confirm the route recovers without shell rebuild.

### Failure recovery

1. Introduce a syntax error during first page activation.
2. Confirm the page remains blank and the server remains alive.
3. Fix the source.
4. Confirm activation retries successfully.
5. Confirm the transaction queue continues processing later updates.

## 28. Validation commands

Run after each major phase:

```sh
pnpm typecheck
pnpm build:plugin
pnpm build:sample:wx
pnpm build:sample:h5
pnpm exec biome check <changed files>
git diff --check
```

Do not manually edit generated `dist` implementation files. Use temporary project copies for DevTools experiments.

## 29. Stop conditions

Stop and report evidence instead of adding an unrelated fallback if any of these occur:

- appended factories cannot wake a blank mounted proxy;
- WXSS-only writes restart App Service;
- preserve-modules output cannot provide stable resolvable module IDs;
- React Refresh registrations cannot remain source-scoped after linking;
- the snapshot build requires private Vite APIs;
- a normal page activation changes `app.js` or a shared host chunk;
- executable code would need to cross the WebSocket;
- dynamic script evaluation would be required.

The final architecture must remain adaptive: observe the accessed page, process only the necessary Vite graph closure, and deliver every activation or edit through the same state-preserving HMR transaction.
