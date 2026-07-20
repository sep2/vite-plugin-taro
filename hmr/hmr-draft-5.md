# WX HMR redesign — current handoff

we already have many impl. check them before proceeding.

read hmr-important-note.md

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

2. **Atomic writes**
   Temporary-file atomic rename caused DevTools to classify the change as an App reload. A complete close-write produced the desired Page-level re-execution. should write to temp folder then rename back.

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

## Proposed protocol

The design is final and is not subjected to change.

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
build-finished
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
3. write inert `hmr/patches.js`;
4. write `hmr/info.js`;
5. emit `full-build-finished`.

Running and materializing a full build must not be separate topology commands.

---

## React Refresh findings

mainly needs to fix window undefined error. nothing special here.

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
- complete hmr flow tests: dev wx loan genius → input edit → button click → result header render → button click navigate route → source edit previous page → button click navigate back → the edit okay and state preserved
