# WX HMR mode architecture

## Status

Phase 1 implemented: the existing WeChat DevTools HMR behavior is isolated behind the `devtools` mode and the shared host/runtime abstractions are in place. No interpreter, source-over-HTTP delivery, fallback behavior, or second executable mode is included.

## Objective

Separate the shared WX HMR engine from the mechanism that delivers and executes a patch.

The refactor must:

- preserve the current DevTools behavior and generated output;
- select one HMR mode once during WX plugin composition;
- keep Rolldown lifecycle, styles, sequencing, reports, and recovery shared;
- isolate physical patch files, Page reload activation, and Page lifecycle handoff inside `devtools`;
- create a narrow runtime patch-installation seam for a future mode;
- avoid mode branches in the per-update hot path;
- avoid adding unused interpreter types, dependencies, endpoints, or runtime code.

## Decisions

### One mode per development server

A WX development server and its App heap use exactly one HMR mode. Modes are alternatives, not concurrent executors.

The mode is resolved before Vite creates the development host. The same immutable mode descriptor is then passed to plugin creation, Rolldown option installation, and host creation.

### Defer public mode selection

Only `devtools` exists, so `createWxDevelopmentPlugin()` constructs it directly. There is no public no-op option, one-entry registry, or selector abstraction.

Add public mode configuration and composition selection only when a second implementation exists. That change will select one descriptor before host construction without introducing mode checks into the update path.

### Select by composition, not runtime conditionals

The selected mode supplies its runtime entry, entry banners, Vite transforms, and delivery implementation. Common code calls those capabilities directly. It must not repeatedly inspect `mode` during patch publication or application.

This also guarantees that a future mode's dependencies cannot enter the `devtools` runtime bundle.

## Ownership

### Shared Node host

The shared development host owns:

- the one Rolldown `DevEngine`;
- Rolldown client registration and build rotation;
- HMR callback buffering and invalid-source recovery;
- style finalization and physical WXSS publication;
- the cumulative patch journal;
- runtime report parsing, conflation, and serialization;
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

## Internal contracts

### Mode descriptor

```ts
export type WxHmrMode = Readonly<{
    runtimeFile: string
    plugins: readonly Plugin[]
    createDelivery: (
        writeFile: (fileName: string, source: string) => Promise<void>
    ) => WxHmrDelivery
    createEntryBanner: (
        pageFiles: ReadonlySet<string>
    ) => (chunk: Readonly<{ name: string; fileName: string }>) => string
}>
```

The descriptor contains only behavior that differs by implementation. A fresh descriptor is created for each Vite plugin composition.

### Delivery contract

```ts
export type PatchPublication = Readonly<{
    buildId: string
    patches: readonly PatchUpdate[]
}>

export type WxHmrDelivery = Readonly<{
    reset: () => Promise<void>
    publish: (publication: PatchPublication) => Promise<void>
}>
```

For `devtools`:

- `reset()` writes the existing `module.exports = undefined` patch module;
- `publish()` renders and writes the complete unacknowledged patch suffix.

The delivery Promise resolves only after that publication is durable. The common host may notify Rolldown only after it resolves.

### Patch journal

Replace the file-aware `PatchPublisher` with a transport-independent `PatchJournal`.

```ts
export class PatchJournal {
    constructor(publish: (publication: PatchPublication) => Promise<void>)

    isCurrentBuild(buildId: string): boolean
    startBuild(): Readonly<{ buildId: string; previousBuildId: string | undefined }>
    produce(patches: readonly PatchUpdate[]): Promise<void>
    acknowledge(seq: number): void
}
```

The journal owns only:

- the current build ID;
- the ordered unacknowledged patch suffix;
- build rotation;
- monotonic prefix pruning.

`produce()` appends patches and passes a structured publication to the selected delivery. It does not render JavaScript or know a destination filename.

A failed delivery leaves every appended patch in the journal. A later publication therefore republishes the complete required suffix.

All journal operations remain serialized by the existing host action edge. The delivery may read the journal's readonly patch view until its Promise settles; no ACK, build rotation, or later publication can overlap it.

### Runtime patch installer seam

The shared runtime accepts a patch descriptor containing only sequence and graph roots, plus a mode-provided installation function.

```ts
export type RuntimePatch = Readonly<{
    seq: number
    changedIds: string[]
}>
```

The shared class exposes one protected method without another payload alias:

```ts
protected applyPatchPayload<Patch extends RuntimePatch>(
    payload: Readonly<{ buildId: string; patches: readonly Patch[] }>,
    installPatch: (patch: Patch) => void
): void
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

The DevTools adapter supplies:

```ts
this.applyPatchPayload(payload, (patch) => patch.factory())
```

No evaluator or source-code type is introduced during this phase.

## Host lifecycle

### Startup

1. Resolve the configured HMR mode.
2. Create the mode's delivery using the common atomic development-file writer.
3. Construct `PatchJournal` with the delivery's `publish()` capability.
4. Install common Rolldown development options using the mode's runtime file and entry-banner factory.
5. Create and run the one physical `DevEngine`.
6. Wait for the initial complete output and style finalization.
7. When the Vite port is bound, rotate to the first real build session.

### Complete build rotation

The common host performs this ordered transaction:

1. rotate the journal build ID;
2. remove the previous Rolldown client when present;
3. register the new Rolldown client;
4. call `delivery.reset()`;
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

The DevTools delivery renders the journal publication into `hmr/patches.js`. No other common component references that path.

### Runtime report

The common report path remains unchanged:

1. parse a bounded POST body;
2. conflate reports by build ID;
3. admit reports through the serialized host action edge;
4. ignore stale build IDs;
5. prune the journal for an applied report;
6. trigger a complete build for a rebuild report.

### Shutdown

Shutdown ordering remains unchanged:

1. complete HMR result buffering;
2. complete runtime report buffering;
3. drain host actions;
4. wait for the current Rolldown generation;
5. complete the action edge;
6. let the existing server and engine shutdown finish.

The initial DevTools delivery has no independent background resource and therefore needs no `close()` method.

## Plugin composition

`createWxDevelopmentPlugin()` constructs the concrete DevTools descriptor once and closes over it for plugin, host, and Rolldown configuration.

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

The DevTools mode plugin contains only the exact Page shell transform and its structural contract check.

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

## Proposed file layout

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
├── runtime-reports.ts
├── wx-dev-options.ts
└── modes/
    └── devtools/
        └── devtools-hmr-mode.ts

packages/vite-plugin-taro/src/runtime/wx/dev/
├── wx-hmr-runtime.ts
└── modes/
    └── devtools/
        ├── devtools-runtime.ts
        └── page-hmr.ts
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

Do not document or advertise an interpreter mode during this phase.

## Complexity

The mode abstraction adds O(1) startup composition and no per-update mode lookup.

Patch behavior remains:

- O(number of retained patches plus rendered code size) per cumulative publication;
- O(acknowledged prefix length) per ACK;
- O(executed module graph edges) for runtime propagation;
- O(number of accepting boundaries) retained hot-context space.

Mutable state remains localized and justified:

- host action queue: serializes asynchronous effects;
- patch journal build ID and suffix: bridges published and applied frontiers;
- runtime session frontier: records successfully applied sequences;
- hot-context map: retains accepting boundaries across cache eviction;
- Page handoff state: spans one native re-registration lifecycle.

The mode descriptor and all publication values are immutable.

## Implementation sequence

1. Introduce the small internal mode and delivery contracts.
2. Construct DevTools mode directly during development plugin composition.
3. Convert `PatchPublisher` into the structured, transport-independent `PatchJournal`.
4. Move physical patch rendering, delivery, banners, and Page shell transformation into the DevTools mode.
5. Pass the descriptor into `installWxDevOptions()` and `createWxDevHost()`.
6. Split `WxHmrRuntime` from `DevtoolsHmrRuntime` and extract Page handoff state.
7. Reorganize tests by shared and mode-specific ownership.
8. Update implementation documentation.
9. Run unit, integration, distribution, WX build, and DevTools stress verification.

## Verification commands

```bash
pnpm typecheck:plugin
pnpm test
pnpm lint
pnpm build:plugin
pnpm build:hmr-stress-demo:wx
pnpm test:hmr-stress-demo:devtools
pnpm test:hmr-stress-demo:rebuild
pnpm test:hmr-stress-demo:recovery
```

## Non-goals

This phase does not:

- add Sval or any JavaScript interpreter;
- add executable source to HTTP responses;
- add polling or WebSocket patch transport;
- add native-first fallback behavior;
- execute one sequence through multiple modes;
- change WXSS delivery;
- change complete-build recovery;
- change React Refresh semantics;
- change Page re-registration semantics;
- expose mode configuration before another implementation exists;
- alter production WX output.

## Completion criteria

The refactor is complete when:

1. all existing DevTools behavior is implemented through the selected `WxHmrMode`;
2. common host and runtime files contain no `hmr/patches.js` or Page re-registration assumptions;
3. DevTools-specific files contain all physical patch and Page handoff behavior;
4. no interpreter package or source-delivery code exists;
5. no public selector or registry exists for the sole implementation;
6. generated development artifacts remain byte-compatible with the current implementation;
7. all automated unit, integration, build, and DevTools stress checks pass.
