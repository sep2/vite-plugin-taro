# WX HMR mode architecture

## Status

Phase 2 implemented: `devtools` and `interpreter` are selectable implementations over the same journal, host ordering, module runtime, styles, React Refresh, reports, and rebuild recovery. Interpreter delivery reuses Vite's existing WebSocket and has no polling timer or HTTP request broker.

## Objective

Separate the shared WX HMR engine from the mechanism that delivers and executes a patch.

The refactor must:

- preserve the current DevTools behavior and generated output;
- select one HMR mode once during WX plugin composition;
- keep Rolldown lifecycle, styles, sequencing, reports, and recovery shared;
- isolate physical patch files, Page reload activation, and Page lifecycle handoff inside `devtools`;
- install native DevTools factories or Sval-interpreted registration programs through one runtime seam;
- avoid mode branches in the per-update hot path;
- keep interpreter source delivery event-driven and bounded to one socket per App heap.

## Decisions

### One mode per development server

A WX development server and its App heap use exactly one HMR mode. Modes are alternatives, not concurrent executors.

The mode is resolved before Vite creates the development host. The same immutable mode descriptor is then passed to plugin creation, Rolldown option installation, and host creation.

### Expose implemented mode selection

`VptOptions.hmr.mode` accepts `'devtools' | 'interpreter'`; omission remains `devtools`. One exhaustive switch resolves the descriptor during plugin composition. No mode check occurs during publication or application.

### Select by composition, not runtime conditionals

The selected mode supplies its runtime entry, entry banners, Vite transforms, and delivery implementation. Common code calls those capabilities directly. It must not repeatedly inspect `mode` during patch publication or application.

This also guarantees that Sval enters only the interpreter runtime bundle and cannot increase the default DevTools runtime.

## Ownership

### Shared Node host

The shared development host owns:

- the one Rolldown `DevEngine`;
- Rolldown client registration and build rotation;
- HMR callback buffering and invalid-source recovery;
- style finalization and physical WXSS publication;
- the cumulative patch journal;
- runtime report parsing and serialized acknowledgement commits;
- ACK handling and rebuild requests;
- payload-delivery notification to Rolldown;
- initial server readiness and shutdown ordering.

The shared host must not know that `devtools` uses `hmr/patches.js` or that a Page is re-registered.

### DevTools Node mode

The `devtools` mode owns:

- the `hmr/patches.js` filename;
- initial patch-module rendering;
- cumulative CommonJS patch-module rendering;
- writing the patch module through the injected physical-file writer;
- the App and Page entry banners;
- the Page shell transform that calls `injectPageHmr()`;
- the DevTools runtime entry selected for nested Rolldown bundling.

### Interpreter Node mode

The `interpreter` mode owns:

- Vite custom events for subscription and source publication;
- reconnect replay from the current journal suffix;
- cumulative messages containing the original `{ seq, changedIds, code }` patch fields;
- stale-subscription and shutdown terminal messages;
- an App-only entry banner and interpreter runtime entry.

It owns no timer, physical JavaScript patch file, HTTP source handler, Page transform, or Page lifecycle state.

### Shared runtime

The shared WX HMR runtime owns:

- module hot contexts;
- accepting-boundary discovery;
- module-graph propagation;
- factory validation;
- module-cache eviction;
- accepted-module re-execution;
- build identity and the applied sequence frontier;
- contiguous batch validation;
- application and rebuild reports.

The shared runtime must not know whether a patch was loaded as native JavaScript or installed by another executor.

### DevTools runtime

The DevTools runtime owns:

- the physical payload shape containing `factory: () => void`;
- `applyPatches()` as the Page banner's public runtime entry;
- invoking each physical patch factory;
- Page re-registration data retention and lifecycle suppression;
- installation of the DevTools runtime singleton on `globalThis`.

### Interpreter runtime

The interpreter runtime owns:

- one Vite-protocol SocketTask and event-driven reconnection;
- build subscription after every connection;
- the App-level Sval sandbox and imported Rolldown runtime registry;
- interpreting each registration program synchronously;
- stopping source consumption after stale-build or failed application results.

## Internal contracts

### Mode descriptor

```ts
export type PatchPublication = Readonly<{
    buildId: string
    patches: readonly PatchUpdate[]
}>

export type WxHmrMode = Readonly<{
    runtimeFile: string
    plugins: readonly Plugin[]
    reset: (server: ViteDevServer, buildId: string, writeFile: WriteDevelopmentFile) => Promise<void>
    publish: (server: ViteDevServer, publication: PatchPublication, writeFile: WriteDevelopmentFile) => Promise<void>
    close: (server: ViteDevServer) => Promise<void>
    configureServer: (server: ViteDevServer, journal: PatchJournal) => void
    usesWebSocket: boolean
    createEntryBanner: (
        pageFiles: ReadonlySet<string>
    ) => (chunk: Readonly<{ name: string; fileName: string }>) => string
}>
```

The descriptor is created once during Vite plugin composition. DevTools reset and publish materialize the journal as a watched file. Interpreter mode sends the same value through `server.ws`; reconnect subscriptions read `journal.current`. A publish Promise resolves only after the selected representation is observable; the common host notifies Rolldown afterward.

### Patch journal

Replace the file-aware `PatchPublisher` with a transport-independent `PatchJournal`.

```ts
export class PatchJournal {
    constructor(publish: (publication: PatchPublication) => Promise<void>)

    readonly current: PatchPublication | undefined
    isCurrentBuild(buildId: string): boolean
    startBuild(): Readonly<{ buildId: string; previousBuildId: string | undefined }>
    produce(patches: readonly PatchUpdate[]): Promise<void>
    acknowledge(seq: number): void
}
```

The journal keeps the original mutable build ID and pending-patch array. `current` adds only a synchronous view used when a reconnected interpreter socket subscribes.

`produce()` appends patches and passes the same structured publication to the selected mode effect bound by the host constructor. It does not render JavaScript, know a destination filename, or own transport listeners.

A failed delivery leaves every appended patch in the journal. A later publication therefore republishes the complete required suffix.

### Runtime patch installer seam

The shared runtime accepts a patch descriptor containing only sequence and graph roots, plus a mode-provided installation function.

```ts
export type RuntimePatch = Readonly<{
    seq: number
    changedIds: readonly string[]
}>
```

The shared class exposes one protected method without another payload alias:

```ts
protected applyPatchPayload<Patch extends RuntimePatch>(
    payload: Readonly<{ buildId: string; patches: readonly Patch[] }>,
    installPatch: (patch: Patch) => void
): boolean
```

The method:

1. rejects stale build identities;
2. skips replayed sequences;
3. validates contiguous new sequences;
4. calls `installPatch()` for each admitted patch;
5. unions `changedIds`;
6. performs graph propagation once for the complete batch;
7. commits the applied frontier only after success;
8. reports either the committed sequence or a rebuild request.

DevTools invokes `patch.factory()`. Interpreter mode invokes `sval.run(patch.code)`. Successful application reports the committed sequence in shared code and returns `true`; failure requests a full build and returns `false` so interpreter mode closes its socket.

## Host lifecycle

### Startup

1. Resolve the configured mode descriptor.
2. Construct the authoritative `PatchJournal` in the host with the mode's publication effect.
3. Install common Rolldown development options using the mode's runtime file and entry-banner factory.
4. Create and run the one physical `DevEngine`.
5. Wait for the initial complete output and style finalization.
6. When the Vite port is bound, rotate to the first real build session.

### Complete build rotation

The common host performs this ordered transaction:

1. rotate the journal build ID;
2. remove the previous Rolldown client when present;
3. register the new Rolldown client;
4. call `mode.reset(server, buildId, writeFile)`;
5. write `hmr/info.js` with the new build ID and report endpoint;
6. write the build-versioned `app.wxss` wrapper.

This preserves the current guarantee that the App-visible root style changes only after the empty patch frontier and matching metadata are durable.

### Incremental publication

The common host performs this ordered transaction:

1. select current Rolldown patch updates;
2. let a full-reload result dominate the batch;
3. finalize styles for the retained patches;
4. write `assets/global.wxss`;
5. call `journal.produce(finalizedPatches)`;
6. await mode delivery durability;
7. notify Rolldown of every delivered payload in sequence order.

DevTools renders the publication into `hmr/patches.js`. Interpreter mode broadcasts the publication through Vite WebSocket; reconnect subscriptions replay `journal.current` without a second snapshot.

### Runtime report

The common report path remains unchanged:

1. parse a bounded POST body;
2. admit the report through the serialized host action edge;
3. ignore stale build IDs;
4. prune the journal for an applied report or trigger a complete build for a rebuild report;
5. return the metadata response while the serialized host action owns journal mutation.

### Shutdown

Shutdown ordering remains unchanged:

1. complete HMR result buffering;
2. drain host actions;
3. wait for the current Rolldown generation;
4. complete the action edge;
5. call `mode.close(server)` so interpreter runtimes stop before Vite closes its socket server;
6. let the existing server and engine shutdown finish.

## Plugin composition

`createWxDevelopmentPlugin()` resolves the configured descriptor once and closes over it for plugin, host, and Rolldown configuration.

The development plugin list becomes:

```text
common vpt:wx-dev plugin
common Rolldown runtime lowering plugin
mode.plugins
common React Refresh transforms
```

The common plugin retains:

- `emptyOutDir: false`;
- bundled-development activation;
- host construction and closing;
- transfer of `app.wxss` ownership to the development host;
- lowering of the assembled Rolldown runtime.

The DevTools mode plugin contains the exact Page shell transform and structural contract check. Interpreter mode contributes no Page plugin.

## Rolldown option installation

`installWxDevOptions()` receives the selected mode.

Shared option normalization remains responsible for:

- stable output names;
- ES output before the existing WX render pipeline;
- minification;
- source-map disabling;
- eager complete graph construction;
- common Rolldown runtime injection;
- reporter plugin installation.

Mode-specific values are supplied through:

```ts
output.banner = mode.createEntryBanner(pageFiles)
rolldownOptions.experimental.devMode.implement = await bundleRuntimeSource(mode.runtimeFile)
```

`bundleRuntimeSource()` must cache by runtime file rather than assuming one process-global runtime entry.

The DevTools entry banner must remain byte-identical:

```js
// App
__rolldown_runtime__.initialize(require('./hmr/info.js'));

// Page
__rolldown_runtime__.applyPatches(require('../../hmr/patches.js'));
```

## Runtime decomposition

Split the current runtime into two areas.

### `WxHmrRuntime`

Move the shared module and update machinery into `wx-hmr-runtime.ts`:

- `WxHotContext`;
- session initialization;
- graph traversal;
- update planning;
- factory validation;
- cache eviction and boundary execution;
- generic patch-payload application;
- runtime reporting.

`WxHmrRuntime` continues to extend Rolldown's injected lexical `DevRuntime` base class.

### DevTools adapter

`devtools-runtime.ts`:

- defines the physical patch payload type;
- extends `WxHmrRuntime`;
- implements `applyPatches()` with `patch.factory()` as the installer;
- implements `injectPageHmr()` through the extracted Page handoff module;
- installs the singleton as `globalThis.__rolldown_runtime__`.

`page-hmr.ts` owns the Page-config symbol, mounted Page reference, re-registration gate, lifecycle forwarding, and native data reference transfer. It has no module-graph or transport responsibility.

### Interpreter adapter

`interpreter-runtime.ts` owns Sval and one SocketTask. It imports the shared runtime object into one sandbox, subscribes the current build after connection, interprets registration programs synchronously, and applies them through `applyPatchPayload()`. Native failure or close reconnects and resubscribes without a timer; explicit reset, shutdown, or application failure stops the socket.

## Implemented file layout

```text
packages/vite-plugin-taro/src/node/plugins/wx/dev/
├── create-hmr-results-stream.ts
├── dev-host.ts
├── hmr-files.ts
├── hmr-mode.ts
├── host-actions.ts
├── patch-journal.ts
├── plugins.ts
├── react-refresh.ts
├── wx-dev-options.ts
└── modes/
    ├── devtools/
    │   └── devtools-hmr-mode.ts
    └── interpreter/
        └── interpreter-hmr-mode.ts

packages/vite-plugin-taro/src/runtime/wx/dev/
├── wx-hmr-runtime.ts
└── modes/
    ├── devtools/
    │   ├── devtools-runtime.ts
    │   └── page-hmr.ts
    └── interpreter/
        ├── interpreter-protocol.ts
        └── interpreter-runtime.ts
```

`hmr-files.ts` retains only shared physical development files and helpers:

- `app.wxss` and `assets/global.wxss` names;
- `hmr/info.js` name;
- build metadata rendering;
- development App style rendering;
- atomic physical file replacement.

`devtools-hmr-mode.ts` owns the `hmr/patches.js` name, patch rendering, delivery, entry banners, and Page shell plugin together. These behaviors form one concrete implementation and do not need pass-through factories or one-function files.

## Test organization

### Shared host tests

Keep or create tests for:

- lossless HMR callback buffering;
- host action serialization;
- runtime report reduction;
- stale build filtering;
- style-before-patch-before-notification ordering;
- complete-build rotation;
- unknown failure logging;
- startup and shutdown barriers.

### Patch journal tests

`patch-journal.test.ts` covers:

- no publication before a build exists;
- cumulative unacknowledged suffixes;
- failed delivery retention;
- monotonic ACK pruning;
- stale ACK behavior;
- fresh build sequence reset;
- structured publication containing the current build ID.

### DevTools mode tests

`devtools-hmr-mode.test.ts` covers:

- App banner bytes;
- Page banner paths;
- unrelated chunks receiving no banner;
- exact Page shell selection;
- `injectPageHmr()` insertion;
- rejection of a Page shell without the stable registration contract;
- fresh plugin descriptor creation;
- initial and cumulative CommonJS bytes;
- inert top-level patch representation;
- empty publication rejection;
- exact physical filename and delivery.

### Runtime tests

`wx-hmr-runtime.test.ts` covers shared behavior:

- hot-context registration and replacement;
- graph propagation;
- cycle and missing-boundary rebuilds;
- factory validation before eviction;
- contiguous batches and replay handling;
- one graph application for a multi-patch batch;
- frontier commit only after success;
- report protocol.

`devtools-runtime.test.ts` covers:

- initial undefined physical payload;
- stale build rejection;
- native factory invocation;
- cumulative payload replay from multiple Pages.

`page-hmr.test.ts` retains the current Page lifecycle and data-reference tests under the DevTools mode directory.

### Interpreter mode tests

Interpreter tests cover App-only banners, WebSocket publication, reconnect replay subscription, stale-build and shutdown messages, Sval registration, interpreter failures, and connection re-establishment without timers.

### Integration acceptance

The existing real DevEngine and WeChat DevTools suites remain authoritative. The refactor must preserve:

- `hmr/info.js` bytes;
- `hmr/patches.js` bytes;
- App and Page banner bytes;
- `app.wxss` bytes;
- patch notification filenames and order;
- build rotation behavior;
- App and React state across updates;
- burst delivery;
- rebuild storms;
- invalid-source recovery;
- hidden Page recovery and Page data retention.

## Documentation

Update:

- `docs/src/content/docs/guides/hot-module-replacement.mdx` to identify the documented implementation as DevTools mode;
- `docs/src/content/docs/references/hmr-implementation.md` to distinguish shared HMR concepts from DevTools-specific patch delivery.

Document both selectable modes, their shared guarantees, and interpreter runtime/performance tradeoffs. `devtools` remains the default.

## Complexity

The mode abstraction adds O(1) startup composition and no per-update mode lookup.

Patch behavior remains:

- O(number of retained patches plus source size) per cumulative publication;
- O(connected Vite WebSocket clients) to broadcast an interpreter publication, normally O(1);
- O(acknowledged prefix length) per ACK;
- O(executed module graph edges) for runtime propagation;
- O(number of accepting boundaries) retained hot-context space.

Mutable state remains localized and justified:

- host action queue: serializes asynchronous effects;
- patch journal publication reference: bridges the published and applied frontiers;
- runtime session frontier: records successfully applied sequences;
- hot-context map: retains accepting boundaries across cache eviction;
- Page handoff state: spans one DevTools native re-registration lifecycle;
- interpreter socket reference: identifies the sole live connection and rejects callbacks from replaced tasks.

The mode descriptor and all publication values are immutable.

## Implementation sequence

1. Keep the Phase 1 shared journal, runtime, and DevTools mode unchanged by default.
2. Add public `'devtools' | 'interpreter'` selection resolved once during composition.
3. Extend delivery with build-aware reset and access to the authoritative journal.
4. Add timer-free interpreter delivery through Vite's existing WebSocket custom events.
5. Add the Sval runtime adapter and reconnect subscription replay.
6. Test source delivery, interpretation, failures, rotation, shutdown, and default DevTools bytes.
7. Run both modes through the real WeChat DevTools burst, rebuild, and recovery suite.
8. Document behavior and performance tradeoffs.

## Verification commands

```bash
pnpm typecheck:plugin
pnpm test
pnpm lint
pnpm build:plugin
pnpm build:hmr-stress-demo:wx
pnpm test:hmr-stress-demo:devtools
pnpm test:hmr-stress-demo:interpreter
pnpm test:hmr-stress-demo:rebuild
pnpm test:hmr-stress-demo:recovery
```

## Non-goals

This phase does not:

- add timer-based polling, heartbeats, SSE, or a second socket server;
- add native-first fallback behavior;
- execute one sequence through multiple modes;
- change WXSS delivery;
- change complete-build recovery;
- change React Refresh semantics;
- change Page re-registration semantics;
- include interpreter or Sval in production WX output;
- alter production WX output.

## Completion criteria

The refactor is complete when:

1. omitted mode and explicit `devtools` preserve existing artifacts and behavior;
2. `interpreter` delivers no physical JavaScript patch and installs no Page transform;
3. interpreter idle delivery reuses one Vite WebSocket and owns no timer, heartbeat, or periodic request;
4. common journal, styles, reports, graph application, React Refresh, and recovery serve both modes;
5. interpreter failures stop source consumption and request a complete build;
6. Sval is bundled only into the selected development runtime;
7. both modes pass unit, integration, build, burst, rebuild, and recovery checks in WeChat DevTools.
