# wx Hybrid HMR Plan

## Status

This document is the implementation plan for wx development hot module replacement. It intentionally uses a hybrid
runtime:

- **SystemJS remains the outer chunk loader.** It owns physical capsule loading, package boundaries, chunk linking, and
  chunk-level execution caching.
- **Rolldown DevRuntime becomes the inner development-module runtime.** It owns source-module identities, hot contexts,
  replacement factories, HMR boundaries, and React Refresh.

Production remains unchanged and contains no DevRuntime instrumentation. The postponed `System.importSync()` work is
independent of this plan.

## Goals

1. Keep the current App, Page, and Component native shell sources.
2. Keep the current native, capsule, and amphibious output kinds.
3. Let Vite bundled development generate both the initial bundle and source-module HMR patches.
4. Preserve the current SystemJS transport and generated-subpackage architecture for the initial development bundle.
5. Preserve the App heap, Taro root, React Fiber tree, and component state for accepted React updates.
6. Use a complete DevTools-owned reload whenever a change cannot be represented safely.
7. Run one Vite server and one Rolldown DevEngine. Do not start a nested Vite build or a second watcher.
8. Transport executable JavaScript only through physical Mini Program files. HTTP carries metadata only.
9. Keep H5 and the production wx pipeline unchanged.

## Non-goals

- Implementing `System.importSync()`.
- Replacing SystemJS records during normal HMR.
- Reconnecting SystemJS importer setters after a source-module update.
- Supporting more than one active WeChat runtime session for one output directory.
- Executing source text received through `wx.request`, `eval()`, or `Function()`.
- Supporting Vite's browser overlay, DOM stylesheet runtime, or browser WebSocket client.
- Supporting Rolldown's browser-oriented lazy compilation in the first implementation.
- Preserving application state across a hard reload.

## Runtime ownership

The two registries have deliberately different identities and responsibilities.

| Concern | SystemJS | Rolldown DevRuntime |
| --- | --- | --- |
| Registry key | Final output chunk URL, for example `vpt:/assets/page.js` | Stable source-module ID, for example `src/pages/home.tsx` |
| Granularity | One final chunk | One transformed source module |
| Physical loading | `require()` and `require.async()` through transport | None; factories arrive inside loaded capsules or `update.js` |
| Initial linking | Cross-chunk System dependencies and cycles | Records the source graph and exports produced inside each chunk |
| Initial execution | Executes each capsule once | Does not execute the initial module body a second time |
| HMR replacement | Unchanged during a successful hot update | Replaces factories and selected cached source modules |
| Dynamic packages | Owns main/subpackage transport | Sees only stable source-module identities |
| React Refresh | No responsibility | Owns hot contexts, accept callbacks, and refreshed component families |

For example, one physical capsule can contain three development modules:

```text
System registry
└── vpt:/assets/page.js
    └── DevRuntime registrations
        ├── src/pages/home.tsx
        ├── src/components/button.tsx
        └── src/stores/session.ts
```

A successful update to `button.tsx` replaces only the inner DevRuntime module. The outer `vpt:/assets/page.js` System
record stays evaluated and cached.

## Hard invariants

1. Initial source-module bodies execute exactly once.
2. SystemJS is the only runtime allowed to load an initial physical capsule.
3. DevRuntime is the only runtime allowed to apply a source-module HMR patch.
4. A normal HMR patch never deletes or re-imports an outer SystemJS capsule.
5. HMR callbacks read fresh exports through DevRuntime, never through a stale outer chunk namespace.
6. Every executable delivery is a literal physical `vpt-hmr/update.js` file.
7. A delivery is successful only after factory installation, module re-execution, accept callbacks, React Refresh, and
   acknowledgement all complete.
8. A failed or partially applied delivery terminates HMR for that runtime heap and requests a hard reload.
9. Only modules reported as executed by the active runtime are eligible for source-module HMR.
10. A change to an unloaded module causes a complete rematerialization in the first implementation. This prevents a
    stale physical capsule from later overwriting a newer dormant factory.
11. The development transport has exactly one active runtime session and one in-flight delivery.
12. Production output contains no development client, DevRuntime, control file, update file, or HMR metadata.

## Vite and Rolldown configuration

### One Vite process

wx development uses Vite's normal `serve` command with `experimental.bundledDev: true`. Vite's bundled development is
currently attached to the client environment, so the wx serve process uses that environment as its only application
build graph. No custom second environment or nested `vite build()` is needed for this implementation.

The production plugin continues to use its current build hooks. Development adds one guarded adapter around Vite's
bundled-development instance.

### Inputs

Reuse the existing resolver inputs:

- `app.js` native App shell;
- `comp.js` native recursive Component shell;
- one exact native Page shell per configured route;
- the physical transport entry.

The existing shell sources continue to import the existing App, Page, and Component capsule sources. No duplicate
development App/Page/Component implementation is introduced.

### Initial output format

Keep Rolldown's ESM output before post-rendering. The existing post-render pipeline remains authoritative:

```text
DevEngine ESM chunk
    ├─ native or amphibious → renderNative() → WeChat CommonJS
    └─ capsule             → renderCapsule() → inert System registration
```

Do not configure the complete DevEngine output as CommonJS. That would bypass the current SystemJS capsule boundary and
create a different development loading architecture.

### DevEngine options

After Vite resolves its bundled-development Rolldown options, the adapter must enforce:

```ts
{
    experimental: {
        devMode: {
            lazy: false,
            implement: wxDevRuntimeSource
        }
    },
    output: {
        format: 'es',
        minify: false,
        sourcemap: true
    }
}
```

`lazy: false` means all currently discoverable dynamic chunks are included in the initial physical output. It does not
mean they execute eagerly. SystemJS still evaluates them only when imported.

The adapter must then restore the plugin's existing output options because Vite bundled development overwrites entry,
chunk, and asset filename defaults after resolving the normal build configuration. In particular, restore:

- exact App, Page, and Component filenames;
- transport naming;
- generated-subpackage chunk naming;
- current asset naming;
- current `preserveEntrySignatures` and code-splitting groups;
- the user's `strictExecutionOrder` value without adding a plugin default.

### Private API boundary

All access to Vite's bundled-development internals lives in one file:

```text
src/node/plugins/wx/development/bundled-dev.ts
```

That adapter may describe only the private surface it actually uses:

- resolved Rolldown option interception;
- initial/full output callback;
- HMR patch callback;
- DevEngine client registration;
- full-build trigger and completion;
- close lifecycle.

It must validate the expected method shapes at startup and fail with one precise unsupported-Vite error. No other module
may cast or access `server.environments.client.bundledDev` internals.

## Initial development materialization

### Generation

The DevEngine owns graph discovery, dependency optimization, bundling, code splitting, and initial source-module
instrumentation. The plugin does not perform a separate `transformRequest()` crawl.

The initial full output still passes through the normal Rolldown output lifecycle, including the current wx hooks:

1. `renderStart` builds the placement plan.
2. `renderChunk` renders native, capsule, and amphibious chunks.
3. Transport materialization injects literal finalized paths.
4. `generateBundle` emits JSON, WXML, WXS, project configuration, and sitemap files.
5. CSS plugins generate and finalize wx-compatible styles.

DevRuntime instrumentation remains inside the rendered capsule body. Importing that capsule through SystemJS executes the
instrumented body and registers each executed source module with DevRuntime.

### Physical writing

Vite configures bundled development with `skipWrite`, so the complete output remains in Vite's memory file store. One
`WxDevelopmentSession` owns all physical writes to the configured wx output directory.

For an initial or complete output, the session:

1. waits for a successful full DevEngine output;
2. normalizes any development CSS payload into `app.wxss`;
3. adds the development control and inert update files;
4. writes every output through a temporary sibling and rename;
5. copies `publicDir` files;
6. clears the previous physical project only when the development session starts;
7. retains files omitted by later DevEngine callbacks, including harmless unreferenced hashes, until the next session;
8. commits a new build ID;
9. reports the physical project path only after all writes finish.

A failed build publishes nothing and leaves the previous physical project untouched.

### Development-only physical files

```text
dist/wx/
├── app.js
├── comp.js
├── pages/**/index.js
├── assets/**
├── sub/p_*/**
└── vpt-hmr/
    ├── control.js
    └── update.js
```

`control.js` contains only serializable startup metadata:

```ts
interface WxHmrControl {
    endpoint: string
    token: string
    buildId: string
}
```

`update.js` begins as an inert file with a unique build comment.

### Native dependencies

Development output adds literal native dependencies without changing the shared shell source behavior:

- `app.js` requires `./vpt-hmr/control.js` before application code executes.
- Every native Page file requires the correctly relative `vpt-hmr/update.js`.

Use a development-only output banner or a native render option. Do not generate a second family of App/Page shell modules.

## The wx DevRuntime

### Location

```text
src/runtime/wx/development/runtime.ts
src/runtime/wx/development/client.ts
src/runtime/wx/development/page.ts
```

No barrel file is added.

### Base runtime

The injected implementation extends Rolldown's supplied `DevRuntime` and keeps its graph, module-cache, factory, and export
operations. The wx layer supplies the host-specific behavior:

- `createModuleHotContext()`;
- loaded-module reporting;
- Vite-compatible accept/dispose/prune/invalidate behavior;
- ordered patch application;
- React Refresh scheduling;
- Taro Page/root preservation;
- metadata communication through `wx.request`;
- hard-reload requests.

It must not contain WebSocket, `document`, `window`, `<style>`, browser overlay, or HTTP JavaScript loading logic.

### Executed-module reporting

Only modules that call DevRuntime's initial `registerModule()` are considered executed. The runtime batches newly executed
stable IDs and reports them to the control endpoint. The host adapter registers those IDs with the DevEngine client.

Do not register every emitted module eagerly. This avoids executing or pretending to execute unloaded Page and dynamic
modules.

If a file change maps only to modules not registered by the active runtime, the adapter requests a complete DevEngine
output instead of publishing an HMR patch. The rebuilt physical capsule is then current before that module can be loaded.

### Hot contexts

The wx hot context implements the Vite API needed by application code and React Refresh:

- `accept()`;
- `acceptExports()`;
- `dispose()`;
- `prune()`;
- `invalidate()`;
- `data`;
- `on()`;
- `off()`;
- `send()`;
- `_internal.updateStyle()` and `_internal.removeStyle()` as host adapters rather than DOM operations.

Hot data is keyed by the stable Rolldown source-module ID and survives accepted source-module replacement within one
runtime session.

## HMR patch generation and publication

### Patch capture

The bundled-development adapter receives each client-specific DevEngine result:

```ts
type WxDevEngineUpdate =
    | { type: 'Noop' }
    | { type: 'FullReload'; reason?: string }
    | {
          type: 'Patch'
          code: string
          filename: string
          hmrBoundaries: readonly {
              boundary: string
              acceptedVia: string
          }[]
          changedIds: readonly string[]
          sourcemap?: string
      }
```

The exact binding shape must be verified against the pinned Vite/Rolldown version by an integration probe before the
adapter type is finalized.

### Safe patch criteria

A patch is eligible for hot publication only when all of these hold:

- the active runtime session and build ID are current;
- every changed source module was reported as executed;
- the DevEngine produced at least one HMR boundary;
- no boundary is reported inside an unsafe circular update;
- no changed module is foundational;
- no native route, JSON, WXML, WXS, project configuration, or package declaration changes;
- no output file topology change is required;
- all required style output has already been written;
- the patch transforms successfully to ES2018 native executable code;
- no unsupported external or browser runtime dependency remains.

Any failed criterion requests a complete rematerialization before the live runtime is mutated.

### Patch transformation

DevEngine patch output bypasses normal `renderChunk`, so the publisher owns one dedicated transformation:

1. preserve DevRuntime graph/factory registration calls;
2. lower syntax to ES2018;
3. remove any final empty ESM marker used only for browser delivery;
4. reject remaining imports or exports;
5. attach a useful source URL and optional source map;
6. embed the result as executable statements in `update.js`.

Do not run `renderCapsule()` on HMR patches. They execute natively and update only the inner DevRuntime registry.

### Delivery format

```ts
interface WxHmrDelivery {
    buildId: string
    sessionId: string
    version: number
    nonce: string
    boundaries: readonly [boundary: string, acceptedVia: string][]
    changedIds: readonly string[]
}
```

The physical file has the conceptual shape:

```js
globalThis.__VPT_WX_HMR__.receive(delivery, () => {
    // DevEngine graph and replacement-factory registrations.
})
```

No JavaScript source is serialized as data and no runtime evaluator is introduced.

### Ordering and acknowledgement

The publisher allows exactly one in-flight delivery:

1. queue patches in source-change order;
2. write the next `update.js` atomically;
3. wait for runtime acknowledgement;
4. publish the next queued patch only after acknowledgement;
5. republish an unacknowledged delivery with a new nonce after a timeout;
6. ignore duplicate execution of an already acknowledged version;
7. request a full rematerialization if the queue or retained bytes exceed a fixed bound.

A new runtime session never replays patches produced for an old heap. If the physical snapshot is behind current source
when a new session registers, create a complete output and start a new build ID.

## Runtime patch application

The runtime serializes delivery application and follows these phases.

### 1. Validate

- compare build ID and session ID;
- reject stale, skipped, or out-of-order versions;
- validate boundary and changed-module metadata;
- reject a delivery after the heap has entered failed state.

### 2. Prepare

- capture old qualified accept callbacks and dispose handlers;
- capture the active Page, Taro root, and current route state;
- begin suppression of DevTools-generated Page lifecycle noise;
- begin one React Refresh transaction.

No module cache is mutated before preparation succeeds.

### 3. Install

Execute the patch body. This updates only DevRuntime graph rows and replacement factories. It must not execute an outer
SystemJS capsule.

### 4. Dispose and re-execute

For every accepted update:

- run the old accepted module's dispose handler with persistent hot data;
- use DevRuntime's source graph to remove the invalidated inner module-cache region;
- initialize the fresh accepted source module from the newly installed factory;
- read fresh exports through `DevRuntime.loadExports(acceptedVia)`;
- leave the outer SystemJS chunk record untouched.

If a required replacement factory is missing, fail the complete delivery.

### 5. Accept or invalidate

Invoke the old qualified callbacks with fresh DevRuntime exports. `hot.invalidate()` reports the invalidation to the
server so the DevEngine can propagate to a higher boundary. If propagation reaches a dead end, request a full reload.

### 6. Refresh

After every accepted callback succeeds:

- release exactly one queued React Refresh operation;
- reconnect the retained Taro root to the active native Page receiver;
- allow the next native task to end lifecycle suppression.

### 7. Acknowledge

Acknowledge only after React Refresh and Page coordination complete. Any exception in install, dispose, re-execution,
accept, or Refresh reports the failed phase and requests complete rematerialization without acknowledging the version.

## React Refresh and Taro Page preservation

### React Refresh

Reuse Vite React's normal development instrumentation and Refresh boundary validation. Adapt only host assumptions:

- `window` becomes `globalThis`;
- the Refresh runtime is bundled as a foundational development module;
- `performReactRefresh()` is delayed until the complete delivery succeeds;
- an invalid Refresh boundary calls `hot.invalidate()`;
- Refresh registration uses stable Rolldown module IDs.

React Refresh remains the only owner of component-family replacement and Fiber state preservation.

### Page coordination

Changing `update.js` can cause DevTools to re-execute native Page entry code and dispatch synthetic lifecycle calls. The
development Page coordinator must:

- make registration of each route idempotent within one runtime session;
- track the active native Page receiver;
- retain the Taro root and route parameters;
- suppress synthetic `onLoad`, `onReady`, `onShow`, `onHide`, and `onUnload` during patch application;
- never suppress genuine navigation outside the bounded patch turn;
- reconnect the retained Taro root after Refresh;
- clear all retained state on a hard reload.

The coordinator does not reinterpret normal Taro lifecycle behavior. Outside an active patch it forwards the exact Taro
configuration methods unchanged.

## CSS and Tailwind

### Initial output

Continue using the existing CSS pipeline, `cssCodeSplit: false`, Tailwind generation, weapp-tailwindcss conversion, and
WXSS compatibility finalizer. The committed initial project must contain one complete `app.wxss`.

### CSS-only changes

A CSS-only DevEngine update writes a fresh `app.wxss` atomically and publishes no JavaScript patch. The wx hot context's
browser-style update/remove operations are host no-ops because the physical stylesheet is authoritative.

### TSX candidate changes

A TSX edit can change both JavaScript and generated Tailwind styles. The development session serializes output work so
that the corresponding `app.wxss` is committed before `update.js` is published.

If the session cannot prove that style generation for the current source version completed, it requests a complete
rematerialization rather than applying JavaScript against stale selectors.

## Full rematerialization

Request a complete DevEngine output when:

- DevEngine returns `FullReload`;
- a changed module was not executed by the active runtime;
- there is no acceptable HMR boundary;
- a circular boundary is unsafe;
- React Refresh invalidation reaches a dead end;
- a foundational module changes;
- native JSON, WXML, WXS, route, project configuration, or package placement changes;
- output files are added or removed;
- CSS ordering cannot be guaranteed;
- patch transformation fails;
- runtime patch application fails;
- acknowledgement times out repeatedly;
- the development server restarts;
- retained delivery state exceeds its bounds.

A full rematerialization:

1. stops publication for the old build ID;
2. asks the DevEngine for the latest complete output;
3. waits for successful output generation;
4. creates a new build ID and inert `update.js`;
5. commits the complete physical project;
6. lets DevTools compile and restart the App;
7. accepts the first runtime session reporting the new build ID.

There is no `wx.reLaunch()` state-restoration protocol and no replay of old hot data into the new heap.

## Server protocol

One token-protected localhost endpoint accepts metadata actions:

```ts
type WxHmrRequest =
    | { action: 'hello'; token: string; buildId: string; sessionId: string }
    | { action: 'modules'; token: string; buildId: string; sessionId: string; ids: string[] }
    | { action: 'ack'; token: string; buildId: string; sessionId: string; version: number }
    | { action: 'invalidate'; token: string; buildId: string; sessionId: string; moduleId: string; message?: string }
    | { action: 'failure'; token: string; buildId: string; sessionId: string; version: number; phase: string }
```

The endpoint never returns executable code. Responses contain only status, build/version metadata, and reload decisions.
Request bodies are size-limited. The server accepts one active session; a new valid session retires the previous one.

## Source layout

```text
src/node/plugins/wx/development/
├── plugin.ts          # serve-only configuration and session installation
├── bundled-dev.ts     # the only private Vite bundled-development adapter
├── session.ts         # output queue, active build/session, full rematerialization
├── publisher.ts       # update.js publication, retry, acknowledgement
└── output.ts          # development output normalization and physical writing

src/runtime/wx/development/
├── runtime.ts         # wx DevRuntime and source-module cache/factory operations
├── client.ts          # metadata protocol and ordered delivery reception
└── page.ts            # Taro root retention and native lifecycle suppression
```

Each file has one clear owner. Do not introduce barrel files or parallel state machines representing the same session.
The session is the single owner of physical writes and build transitions; the publisher owns only one build's delivery
sequence.

## Implementation phases

### Phase 0: executable probes

Before production implementation, create focused probes that verify the pinned Vite/Rolldown behavior:

1. bundled development accepts the existing wx inputs with `devMode.lazy: false`;
2. initial DevEngine chunks pass through current `renderChunk` and `generateBundle` hooks;
3. a rendered capsule can contain DevRuntime source-module registrations and still export its normal namespace;
4. HMR patch output contains graph/factory registrations and exposes stable boundaries;
5. patch output bypasses normal `renderChunk`;
6. changing `update.js` causes DevTools to execute it while retaining the App heap;
7. loaded-module reports correspond to actual DevRuntime `registerModule()` calls;
8. CSS output ordering is observable and deterministic enough to gate patch publication.

A failed probe changes the plan before implementation; it must not be hidden behind compatibility code.

### Phase 1: initial bundled-development project

- enable bundled development for wx serve;
- install the guarded adapter;
- enforce lazy false and the custom runtime source;
- restore current output options;
- capture and physically write the complete initial output;
- emit inert control/update files;
- verify current shells, capsules, transport, packages, JSON, WXML, and WXSS in DevTools.

At the end of this phase, source edits may perform complete rematerializations only.

### Phase 2: source-module registration and plain JavaScript HMR

- install the wx DevRuntime;
- report actually executed stable module IDs;
- capture client-specific patches;
- publish one versioned update at a time;
- implement factory installation, inner cache replacement, accept/dispose, and acknowledgement;
- hard-reload on unloaded modules or unsafe boundaries.

### Phase 3: React Refresh and Page preservation

- adapt the React Refresh runtime to `globalThis`;
- delay Refresh until delivery completion;
- add idempotent Page registration and bounded lifecycle suppression;
- retain/reconnect the Taro root;
- verify component state and App heap preservation.

### Phase 4: CSS and Tailwind updates

- write CSS-only output without a JavaScript patch;
- order TSX-generated WXSS before JavaScript delivery;
- hard-reload when style freshness cannot be proven;
- verify selector/class rewrites remain synchronized.

### Phase 5: recovery and hardening

- invalidation propagation;
- duplicate delivery and retry handling;
- runtime/server restart behavior;
- bounded queue and byte limits;
- complete diagnostics and source maps.

## Validation

### Unit tests

- bundled-dev adapter rejects an unsupported private API shape;
- resolved dev options retain current filename, placement, and strict-order settings;
- `lazy` is false and the wx runtime implementation is injected;
- only executed modules are registered with the DevEngine client;
- publisher permits one in-flight delivery and retries with a new nonce;
- stale build/session/version messages are rejected;
- duplicate deliveries are idempotent;
- failure never acknowledges a delivery;
- source-module cache replacement does not mutate the outer System registry;
- fresh exports come from DevRuntime;
- hot data survives an accepted update;
- unloaded-module changes request complete output;
- CSS publication precedes its JavaScript patch.

### Integration tests

- initial bundled development emits exact App/Page/Component paths;
- native entries remain CommonJS and application chunks remain System capsules;
- development capsules contain DevRuntime registrations;
- transport still uses literal `require()` and `require.async()` paths;
- generated subpackages and app.json declarations remain consistent;
- output contains no browser WebSocket, DOM overlay, or executable HTTP loader;
- a shared utility self-accepts and receives fresh exports;
- an invalid boundary requests complete output;
- a circular unsafe boundary reloads before mutation;
- adding/removing an import is either patched safely or fully rematerialized;
- server restart creates a new build and rejects old deliveries;
- H5 development and production builds remain unchanged.

### DevTools probes

- App heap identity survives a valid update;
- React Fiber identity and local component state survive a valid Refresh boundary;
- changing a Page component does not run genuine Page load/unload behavior twice;
- changing an unloaded Page performs a complete rematerialization before later navigation;
- dynamic imports still load through the current SystemJS transport;
- generated-subpackage dynamic imports still use `require.async()`;
- CSS-only edits update visible styles without replacing the App heap;
- TSX class changes update WXSS before refreshed rendering;
- patch failure converges to a fresh App heap through DevTools reload.

## Known risks

### Private Vite bundled-development API

The initial-output and patch callbacks are not public extension points. Keep the adapter small, validate it at startup, and
pin implementation tests to the supported Vite/Rolldown version.

### Patch output bypasses current render hooks

This is intentional. Initial chunks use the existing native/capsule renderer; patch files use the dedicated native patch
transform and update only DevRuntime.

### Two registry layers

A successful HMR path must never read fresh source exports from a cached System namespace. Dedicated tests must enforce
that callbacks and Refresh use `DevRuntime.loadExports()`.

### Unloaded physical capsules

The first implementation rematerializes on changes to unloaded modules. This avoids dormant-factory versus stale-capsule
races without eagerly executing every Page and dynamic module.

### DevTools lifecycle behavior

Page entry re-execution and synthetic lifecycle ordering are platform behavior, not browser HMR behavior. Keep lifecycle
suppression narrowly scoped to one patch turn and validate it with executable DevTools probes.

## Research anchors

- Vite 8.1 bundled development implementation:
  <https://github.com/vitejs/vite/blob/f2ef7064d85a960beb163ca6f83e38f60946da65/packages/vite/src/node/server/bundledDev.ts>
- Vite's generic HMR client behavior:
  <https://github.com/vitejs/vite/blob/f2ef7064d85a960beb163ca6f83e38f60946da65/packages/vite/src/shared/hmr.ts>
- Vite React Refresh boundary validation:
  <https://github.com/vitejs/vite-plugin-react/blob/8ae5449be23079dd17fdefc64064a3d94be6fc39/packages/common/refresh-utils.ts#L20-L64>
- Rolldown DevRuntime source-module graph, cache, and factory model:
  <https://github.com/rolldown/rolldown/blob/6cbd2330dc5ca973b90444973ee04c2dc7ee2f2/crates/rolldown_plugin_hmr/src/runtime/runtime-extra-dev-common.js>
