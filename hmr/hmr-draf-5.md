# WX HMR redesign — current handoff

## Objective

Implement physical WX HMR where:

- executable updates travel only through a physical `hmr/patches.js`;
- HTTP carries metadata and runtime reports only;
- DevTools detects `patches.js`, re-executes the Page, and thereby loads patches;
- the App-owned runtime survives Page re-execution;
- React Refresh/state preservation runs before the runtime advances its version.

---

## Hard platform findings

1. **Ordinary HMR must change only `hmr/patches.js`.**
   Wider output changes may make DevTools restart the entire App.

2. **Use direct `fs.writeFile`.**
   Temporary-file atomic rename caused DevTools to classify the change as an App reload. A complete close-write produced the desired Page-level re-execution.

3. **Executable patches cannot travel over HTTP.**
   HTTP is metadata-only. Patch JavaScript remains physical.

4. **Page re-execution must not recreate the HMR runtime.**
   The runtime belongs to the App/global heap.

5. **SystemJS does not provide browser-style lexical globals.**
   Setting `global.window = global` does not make free `window` or DevTools-hook identifiers work reliably. Exact AST rewrites to `global.*` are required.

6. **A full build is the recovery boundary.**
   DevTools restarts the App, destroying all App-global runtime state. No special runtime reset/recovery protocol is needed after a successful full build.

---

## Identity and version model

A full build has a fresh `buildId`; it does not have a patch version.

```text
Build A baseline: version 0
HostPatch 1:       version 1
HostPatch 2:       version 2

full rebuild

Build B baseline: version 0
```

The current build model is deliberately small:

```ts
type HostPatch = {
    code: string
    fileName: string
    sourcemap?: string
    sourcemapFileName?: string
}

type Build = {
    buildId: string
    patches: HostPatch[]
}
```

Patch version is implicit:

```text
HostPatch version = array index + 1
host version       = build.patches.length
```

### Build ID is also the Rolldown client ID

There should be no separate random runtime/client identity:

```text
buildId = Rolldown clientId = App runtime identity
```

Therefore:

- module registration uses `buildId`;
- Rolldown HMR callbacks return `clientId`, which is treated as `buildId`;
- `patch-produced` facts carry that build ID;
- topology rejects delayed patches belonging to an older build.

A simple `isRebuilding` boolean was rejected because a delayed old callback could arrive after it becomes `false`.

---

## Final protocol

```text
runtime reports { buildId, version V }
        │
        ▼
host compares V with Build.patches.length N
        │
        ├─ build mismatch ───────────────▶ full rebuild
        ├─ V > N ────────────────────────▶ full rebuild
        ├─ V = N ────────────────────────▶ no patch write
        └─ V < N
             │
             ▼
host direct-writes patches.js with V+1..N
             │
             ▼
DevTools notices patches.js
             │
             ▼
DevTools re-executes the Page
             │
             ▼
Page requires patches.js
             │
             ▼
patches.js stores { metadata, patch factory } in App runtime
             │
             ▼
after synchronous Page evaluation returns, runtime reconciles
             │
             ├─ Rolldown factories/callbacks
             ├─ React Refresh
             └─ Taro/Page completion
             │
             ▼
runtime reports version N
```

`patches.js` must never execute its patch factory synchronously. Its only direct effect is:

```ts
runtime.storePatches(metadata, patchFactory)
```

No explicit `pageRestarted()` event is needed. Calling `storePatches()` during Page evaluation proves the Page is being re-executed; runtime reconciliation can be queued after the current synchronous stack.

On any runtime error:

```text
runtime → host: { buildId, version, reason }
host → full rebuild
DevTools → App restart
```

---

## Host topology

The required architecture is:

```text
facts ──> topology ──> commands ──> edge consumers
  ▲                                      │
  └──────────── operation results ───────┘
```

### Only retained topology value

The current `Build`.

There is no:

- runtime registry;
- remembered runtime version;
- pending request map;
- held HTTP request;
- delivery acknowledgement state;
- exported state machine;
- `Transition` object;
- command array accumulator;
- build-epoch abstraction;
- full-build version.

### Current topology structure

`topology.ts` preserves the intended composition:

```text
shared fact bus
  ├─ createBuild()
  │    └─ successful full build resets Build
  │    └─ patch-produced appends HostPatch
  │
  └─ createCommands()
       ├─ runtime request → missing suffix / rebuild
       ├─ explicit rebuild fact → rebuild
       ├─ patch limit → rebuild
       ├─ patch write failure → rebuild
       └─ runtime failure → rebuild
```

### Facts

Current important facts are:

```text
rebuild-requested
full-build-finished
patch-produced
patches-written
runtime-requested
runtime-failed
```

### Commands

Only two command kinds remain:

```ts
{ kind: 'request-rebuild'; reason }
{ kind: 'write-patches'; build; fromVersion }
```

A full build is one composite operation:

1. generate fresh `buildId`;
2. run DevEngine complete output;
3. write `hmr/info.js`;
4. write inert `hmr/patches.js`;
5. emit `full-build-finished`.

Running and materializing a full build must not be separate topology commands.

---

## Edge design

Every edge receives the shared `facts$` and publishes its own observations. Callback-style plumbing such as `reportFailure`, `requestPatches`, `onChanged`, and `onError` was removed.

### `edges/control.ts`

- metadata-only HTTP endpoint;
- validates token;
- registers modules under `buildId`;
- publishes `runtime-requested`;
- publishes `runtime-failed`;
- immediately completes HTTP requests;
- retains no runtime/session/version state.

### `edges/dev-engine.ts`

- installs Vite bundled-development DevEngine;
- emits rebuild facts for unsafe changes/full reloads/errors;
- emits `patch-produced` directly;
- treats Rolldown `clientId` as `buildId`;
- does not select physical ranges.

### `edges/output.ts`

- writes `hmr/info.js`;
- writes inert `hmr/patches.js` after a full build;
- directly close-writes active patch modules;
- publishes `patches-written` success/failure facts.

### `edges/public-files.ts`

- mirrors public files serially;
- emits a full-rebuild fact after a physical public-file change or synchronization failure.

### `dev-host.ts`

Should only:

- create `facts$`;
- construct the edges;
- construct topology;
- serialize commands through `concatMap`;
- execute the two command kinds;
- close resources.

---

## React Refresh findings

The necessary narrow transforms are currently preserved under the abandoned implementation:

1. `/@react-refresh`
    - append `injectIntoGlobalHook(global)`;
    - rewrite the two exact `window.__*` integration hooks to `global.__*`;
    - wrap `enqueueUpdate()` and `performReactRefresh()` through the App runtime.

2. React Reconciler
    - rewrite free `__REACT_DEVTOOLS_GLOBAL_HOOK__` references to `global.__REACT_DEVTOOLS_GLOBAL_HOOK__`.

3. Vite component boundaries
    - rewrite only `window.$Refresh*` members to `global.$Refresh*`.

Requirements:

- no broad Vite `define` replacement;
- no matching Vite error-message text;
- install Refresh globals and the DevTools hook before React executes;
- capture asynchronous Refresh exceptions and report runtime failure;
- report the new runtime version only after Refresh/reconciliation succeeds.

`reactRefreshRuntimeId` and the resolved React Reconciler root live in `wx/module.ts`. `react-reconciler` is now a direct package dependency.

A remaining semantic question is the exact visible-completion boundary: `performReactRefresh()` returning proves Refresh dispatch, not necessarily a committed Taro/WX render.

---

## Rejected designs

- Runtime polling, retry timers, watchdog timers, and Refresh deadlines.
- Host-side runtime/session registry.
- Host storing the latest runtime version.
- Holding runtime HTTP requests.
- A separate host `execute(publicationId)` command.
- `patches.js` directly executing patches.
- Explicit `pageRestarted()` signalling.
- Full-build versions.
- Separate build-epoch topology.
- Separate `run-full-build` and `materialize-full` commands.
- Separate `SafePatch`, `ProducedPatch`, `PatchProjection`, and `PatchHistory` types.
- Random Rolldown client IDs.
- Rebuilding boolean as stale-callback protection.
- Temporary-file atomic rename.
- Broad React global rewrites.

---

## Current implementation state

The new work exists at:

```text
wx/dev/topology.ts
wx/dev/dev-host.ts
wx/dev/edges/control.ts
wx/dev/edges/dev-engine.ts
wx/dev/edges/files.ts
wx/dev/edges/output.ts
wx/dev/edges/public-files.ts
```

However, it is not integrated yet:

1. `wx/dev/plugin.ts` still imports:
    - `./abandon/dev-host.ts`
    - `./abandon/react-refresh.ts`

2. The new App-owned development runtime source is absent:
    - `src/runtime/wx/dev/dev-runtime.ts` is deleted.
    - DevEngine currently attempts to read its built `dist` path.
    - A clean plugin build therefore cannot supply the new runtime.

3. The runtime still needs to be designed around:
    - construction with `buildId` as Rolldown client ID;
    - `storePatches()`;
    - deferred reconciliation;
    - version/failure reporting;
    - React Refresh completion;
    - App ownership across Page re-execution.

4. New topology/edge tests have not yet been added.

5. Package typecheck currently fails because the moved `wx/dev/abandon/` files remain included and reference deleted legacy APIs. The new files themselves currently produce no reported TypeScript diagnostics.

---

## Known unresolved correctness issues

### 1. Protocol liveness

Current topology writes patches only when it receives `runtime-requested`.

If the runtime reports version `N` while host version is also `N`, the request completes with no write. If a new HostPatch arrives later, nothing currently causes another runtime request or patch write.

One liveness mechanism is still required:

- runtime repeats requests;
- host notifies runtime to report;
- host holds a request;
- or host remembers runtime version.

The latter two were explicitly rejected, and runtime timers were also rejected. This needs a final decision.

### 2. Queued old writes across rebuilds

`concatMap` can retain an old `write-patches` command while a rebuild command is queued. It must be impossible for an old Build’s `patches.js` write to execute after a new full build and overwrite its inert patch file.

Command cancellation or build validation at execution time is still needed.

### 3. Patch-limit behavior

Current `createBuild()` uses:

```ts
take(maximumPatchPerBuild)
```

Therefore it stops appending at the limit. Its comments currently say patches continue appending while rebuild runs; implementation and documentation disagree.

### 4. Initial build readiness

`bundledDev.listen()` currently observes DevEngine completion before DevHost finishes writing `hmr/info.js` and inert `hmr/patches.js`. Full-build readiness should include both steps.

### 5. Runtime/client initialization

Using `buildId` as Rolldown client ID requires constructing the runtime with information from `hmr/info.js` before application modules register. That bootstrap order is not implemented yet.

---

## Validation evidence

The previous architecture was live-tested successfully in DevTools:

- title changes applied/restored;
- only the physical update file changed;
- App/runtime identity remained stable;
- version advanced;
- React renderer registration succeeded;
- no console errors were observed.

Those results established the platform constraints, especially direct close-write and App ownership, but they do not validate the newly redesigned topology/runtime.

Still pending:

- new end-to-end physical `patches.js` protocol;
- rapid edits;
- delayed stale callbacks;
- input/component state retention;
- Refresh exception → full rebuild;
- full-build reset;
- final tests/build/typecheck.
