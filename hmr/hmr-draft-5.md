# WX HMR redesign — current handoff

we already have many impl. check them before proceeding.

read `packages/vite-plugin-taro/src/node/plugins/wx/dev/important-hmr-note.md`

the impl already did, and opens successfully in devtools.

the hmr seems working too.

So you must do deep analysis, keep the whole flow detailed recorded.

how it works, why it works, each step.

this is the latest prompt.

directly append your result into this document for later analysis.

then you should analyze whats is necessary to make hmr works that is not normally seen by web hmr. keep every point recorded.

that is, record everything that is different than web hmr.

you must also edit every files in the working tree thats changed, detailly comments and illustrate why this is necessary for wechat hmr to works.

do not repeat impl detail. record the reason that it makes to hmr works.

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

2. **Direct complete writes, not atomic rename**
   Temporary-file atomic rename caused DevTools to classify the change as an App reload. A direct open/write/close of the
   final `patches.js` path produced the required Page-level re-execution; no temporary sibling may be renamed into place.

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
patches.js stores { metadata, one factory per HostPatch } in App runtime
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

`patches.js` must never execute patch code synchronously. Its only direct effect is:

```ts
runtime.storePatches(metadata, patchPrograms)
```

A suffix keeps one factory per `HostPatch`. Rolldown's React wrapper installs replacement acceptance callbacks in a
microtask, so each logical program needs its own microtask and Refresh checkpoint before the next program runs.

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
modules-reported
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

React Refresh needs both exact AppService-global rewrites and transaction integration. Generated `window.$Refresh*` and
free React DevTools-hook references become `global.*`; the timer debounce becomes a promise owned by `WxDevRuntime` so
version advancement waits for Refresh and any thrown exception crosses the full-build recovery boundary.

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

The complete flow passed in DevTools: dev WX Loan Genius → edit input → calculate → verify result header → navigate to
monthly payments → edit the previous Page source → navigate back → verify the edit, result header, and input state.

---

## Final implementation and research record (2026-07-20)

### Research conclusions

The implementation follows the exact capabilities exposed by the pinned toolchain rather than emulating browser HMR:

- WeChat officially classifies a changed Page dependency as Page JavaScript hot reload, while an unused JavaScript file,
  JSON, or `app.js` causes a complete compile. This is why every ordinary publication changes one Page dependency and why
  unsafe changes cross the full-build boundary: [WeChat code hot reloading](https://developers.weixin.qq.com/miniprogram/dev/devtools/hotreload.html).
- Vite bundled development creates a Rolldown `DevEngine`, registers executed modules by client ID, and routes updates back
  to that client ([Vite `bundledDev.ts`](https://github.com/vitejs/vite/blob/a477454442eff649b430f9e3c6caf2500fcb7183/packages/vite/src/node/server/bundledDev.ts#L100-L165)).
  Its browser runtime normally creates a random client ID and transports module reports over Vite HMR
  ([Vite `client.ts`](https://github.com/vitejs/vite/blob/a477454442eff649b430f9e3c6caf2500fcb7183/packages/vite/src/client/client.ts#L629-L672)).
  WX replaces only those transport/startup edges and uses `buildId` as that same client identity.
- Rolldown's runtime module table replaces export holders and reports executed modules
  ([runtime common](https://github.com/rolldown/rolldown/blob/6cbd2330dc5ca973b90444973ee04c2dc7ee2f2d/crates/rolldown_plugin_hmr/src/runtime/runtime-extra-dev-common.js#L30-L82),
  [registration batching](https://github.com/rolldown/rolldown/blob/6cbd2330dc5ca973b90444973ee04c2dc7ee2f2d/crates/rolldown_plugin_hmr/src/runtime/runtime-extra-dev-common.js#L138-L169)).
  A generated patch initializes affected boundaries and then calls `applyUpdates`
  ([Rolldown HMR stage](https://github.com/rolldown/rolldown/blob/6cbd2330dc5ca973b90444973ee04c2dc7ee2f2d/crates/rolldown/src/hmr/hmr_stage.rs#L675-L699)).
  Therefore the custom runtime should extend this contract, not parse or reinterpret patch source.
- Rolldown's bundled React wrapper queues replacement export registration and `hot.accept` setup in `queueMicrotask`
  ([React wrapper](https://github.com/rolldown/rolldown/blob/6cbd2330dc5ca973b90444973ee04c2dc7ee2f2d/crates/rolldown_plugin_vite_react_refresh_wrapper/src/lib.rs#L51-L80)).
  This proves that a missing suffix must retain individual HostPatch boundaries. Running concatenated patch programs in
  one synchronous turn can reach patch N+1 before patch N's replacement callback exists.
- Vite React Refresh assumes `window`, a timer-debounced `enqueueUpdate`, and an asynchronous
  `performReactRefresh()` path ([Refresh runtime](https://github.com/vitejs/vite-plugin-react/blob/640fd358a0e82393acfce4e92e19a6ac6e1641a7/packages/common/refresh-runtime.js#L590-L648)).
  WX rewrites only those generated global probes and replaces the debounce with an App-runtime promise so Refresh success
  or failure is part of the patch transaction.
- Taro assigns `$taroPath`, stores the native Page as `pageElement.ctx`, and unmounts the React tree from `onUnload`
  ([Taro Page runtime](https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-runtime/src/dsl/common.ts#L108-L200)).
  Taro can rehydrate all retained children through `updateChildNodes`
  ([Taro node](https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-runtime/src/dom/node.ts#L42-L52))
  and exposes completion through `enqueueUpdateCallback`
  ([Taro root](https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-runtime/src/dom/root.ts#L194-L209)).
  Those contracts justify suppressing only synthetic reload lifecycles and rebinding the retained root to DevTools'
  replacement Page receiver.

### Startup flow

1. The serve-only WX plugin enables Vite bundled development, disables sourcemaps throughout Oxc/Babel/Rolldown, forces
   stable physical names, and installs the custom Rolldown runtime implementation.
2. `createDevHost` prepares public output, creates one shared fact bus, subscribes topology/control/output/public edges,
   and only then emits the initial rebuild fact. No startup observation can be lost.
3. The output edge generates a fresh `buildId`, asks DevEngine for a complete physical output, then writes immutable
   `hmr/info.js` and inert `hmr/patches.js`. This entire sequence is one topology operation.
4. Vite's replaced `bundledDev.listen()` resolves only after that composite result, so HTTP readiness never precedes the
   metadata and patch dependencies required by `app.js`.
5. Final chunk preparation places `require('./hmr/info.js')` before App dependencies. The generated Rolldown runtime can
   therefore construct exactly one `WxDevRuntime(info)` before any application module registers.
6. That App-global runtime uses `buildId` as Rolldown's client ID, reports executed module IDs, and opens one metadata-only
   long poll at `{ buildId, version: 0 }`.

### Ordinary edit and publication flow

1. Rolldown watches source files, identifies HMR boundaries for the modules reported by this build ID, and emits a Patch.
   A non-JavaScript change, additional asset, FullReload, or generation error emits a rebuild fact instead.
2. The topology appends the `HostPatch` to the current `Build`. Its array index plus one is the only patch version.
3. A held synchronize request observes `patch-produced` and republishes its immutable runtime report. The topology compares
   runtime version `V` with host version `N`: equal waits, behind writes `V..N`, mismatch/ahead rebuilds.
4. The output edge serializes physical effects and verifies the command's Build identity at execution time. An obsolete
   queued write cannot overwrite a newer full build.
5. The host performs one direct open/write/close of `hmr/patches.js`. It does not rename a temporary sibling, touch normal
   chunks, or send executable JavaScript over HTTP. The HTTP response only says that the physical publication completed.
6. WeChat sees a changed JavaScript dependency of every Page and re-executes live Page entries. Each entry synchronously
   requires the shared patch file, which only calls `storePatches(metadata, programs)`; no patch executes in `require()`.
7. `initializePage(fileName, Page)` is idempotent in the App heap. Initial evaluation registers the native shell; physical
   re-execution does not call `Page()` again and therefore does not remount Taro before Refresh.
8. DevTools' synthetic replacement lifecycle is intercepted while the publication is pending. `onUnload` captures the
   old `$taroPath`, params, config, and receiver; replacement `onLoad`/`onShow` receive that identity. Ordinary navigation
   outside a patch still invokes Taro unchanged.
9. After the Page's synchronous evaluation returns, the runtime executes each HostPatch program in order. For every
   program it runs Rolldown's old HotContext callbacks, yields for replacement callback registration, and awaits that
   program's React Refresh promise. This preserves correctness for rapid multi-patch suffixes.
10. The runtime binds each retained Taro root to the replacement native Page receiver, requests a full child rehydration,
    and drains newly observed Pages until all corresponding `setData` callbacks complete.
11. Only after all programs, Refresh commits, and Page rehydrations succeed does `version = N`. The runtime then reports
    the new version and opens the next long poll.

### Recovery and stale-work rules

- Any invalid range, missing boundary, Refresh exception, Taro rebinding error, HTTP-reported runtime failure, patch write
  failure, or patch-history limit requests a full build.
- A successful full build changes `buildId`, resets history/version to zero, and changes enough physical output for
  DevTools to restart the App heap. That restart is the reset protocol; no second runtime state machine exists.
- Delayed Rolldown callbacks carry their old client/build ID and cannot enter the current Build. Late module reports are
  also ignored by the output edge once their build is no longer materialized.
- Rebuild requests are exhausted until one composite `full-build-finished` fact arrives. This coalesces failure bursts
  without retaining an `isRebuilding` flag that could misclassify delayed callbacks.
- All output commands share one physical lane. A write command additionally checks `materializedBuildId`, so command queue
  ordering cannot let old executable source replace a new inert baseline.

### Why this is not web HMR

| Browser/Vite HMR | Physical WX HMR |
| --- | --- |
| WebSocket tells a browser to import an HMR URL. | HTTP carries only reports; executable code must appear in a watched physical file. |
| The page/global runtime survives a module import naturally. | Page code is re-executed, so the runtime must belong to the longer-lived App heap. |
| `window`, `globalThis`, script globals, and a DOM are available. | AppService has `global` but no browser lexical globals; exact generated identifiers must be rewritten. |
| A JS import applies the update directly. | `patches.js` loading must be passive until DevTools finishes the current Page evaluation. |
| Browser page lifecycle is not replayed for HMR. | DevTools synthesizes native Page replacement lifecycle that would make Taro unmount React. |
| React DOM remains attached to the same page object. | Taro's retained root must be rebound and rehydrated against a replacement native Page receiver. |
| Output files are usually served from memory. | File path, write shape, close timing, and which files changed determine DevTools' reload classification. |
| One update message normally means one patch import. | A runtime can be several versions behind, and each logical HostPatch needs a microtask/Refresh checkpoint. |
| The server can discover its endpoint after listening. | `info.js` must exist before App execution, so strict configured port metadata is materialized before listen resolves. |
| Full reload is `location.reload()`. | Full recovery is a complete physical build that causes DevTools to destroy and recreate the App heap. |

### Validation record

- Unit suite: topology range selection/stale IDs/rebuild coalescing, passive file rendering, precise AST rewrites, native
  shell interception, App-runtime HotContext/Refresh/error handling, multi-program rapid suffixes, and Taro Page rebinding.
- Physical host integration: launched `pnpm dev:loan-genius:wx`, registered the 144 executed module identities, held the
  runtime synchronize request, changed/restored the calculator source, and verified both publications. At each edit the
  only changed output was `hmr/patches.js`; responses were metadata-only `patches-published`.
- Rapid suffix integration: reporting version 0 after two retained HostPatches produced one physical range with two
  separate factories and two Rolldown `applyUpdates` checkpoints.
- Live DevTools flow: input/result state, forward navigation, background Page source edit, back navigation, changed UI,
  App/runtime identity, build ID, version advancement, rapid edits, full-build reset, and failure recovery all passed as
  recorded in `important-hmr-note.md`.
- Final post-research rerun: input `246`, result header `房屋总价`, two-Page navigation stack, background title edit,
  unchanged active route, unchanged App runtime/build ID/native Page identities, back navigation to the edited title, and
  retained input/result state passed. Source restoration repeated the same single-file publication and advanced version
  `1 → 2`; the final error/warning console query was empty.

the impl already did, and opens successfully in devtools.

the hmr seems working too.

So you must do deep analysis, keep the whole flow detailed recorded.

how it works, why it works, each step.

this is the latest prompt.

directly append your result into this document for later analysis.

then you should analyze whats is necessary to make hmr works that is not normally seen by web hmr. keep every point recorded.

that is, record everything that is different than web hmr.

you must also edit every files in the working tree thats changed, detailly comments and illustrate why this is necessary for wechat hmr to works.

do not repeat impl detail. record the reason that it makes to hmr works.

## 2026-07-20 implementation experiments

### Failures found

- The first physical patch executed, but recovery requested a full build because `global.document` is not Taro's document.
  Taro's document is available from the registered `@tarojs/runtime` module exports instead.
- DevTools replacement lifecycle receivers have no `route`/`__route__`; the native Page shell must provide its
  build-specialized file name to the App runtime.
- Letting DevTools' synthetic `onUnload`/`onLoad` enter Taro remounted the React root and erased input/result state.
- DevTools reloads live Page entries sequentially. A second Page can reach its replacement lifecycle while the first
  Page's Taro `setData` is still pending. A single snapshot of Pages to restore left the active route blank.

### Working runtime behavior

- The App runtime captures Taro's document from Rolldown module registration.
- Every native Page shell carries its exact route identity into lifecycle interception.
- During a physical patch cycle, all synthetic Page lifecycles are suppressed. The runtime transfers the old Taro path,
  params, and config to DevTools' replacement receiver, then binds the retained Taro root to that receiver.
- Page restoration drains batches until no replacement Page arrived during the previous `setData`; patch version advances
  only after React Refresh and every observed Page restoration complete.

### Live DevTools evidence

- Complete flow passed repeatedly (including the final implementation run with `246`): entered a value, calculated and
  rendered the result header, clicked through to monthly payments, edited the previous Page source, retained the visible
  monthly-payments route, clicked Back, and observed the edited title with the result header and input value still present.
- The App runtime and both Page objects retained identity; the build ID stayed fixed and patch version advanced.
- Ordinary edits changed only `hmr/patches.js`; `hmr/info.js` and all normal output files stayed byte-identical.
- Two immediate source edits advanced through both versions, rendered the final edit, and retained input state.
- A CSS edit crossed the full-build boundary: build ID/runtime identity changed, version reset to `0`, and
  `hmr/patches.js` became inert. Restoring the CSS repeated the clean reset.
- An injected runtime reconciliation exception reported failure over HTTP and caused the same successful full-build reset.
- No HMR errors or warnings remained in the DevTools App console.

## Why the non-web machinery is necessary

- WeChat chooses reload scope from the physical file graph, not from Vite's HMR message. A single shared Page dependency
  is the only reliable trigger that leaves the App heap alive while re-evaluating every live Page.
- A direct completed write is semantically different from replacing a file by rename in DevTools' watcher. The former was
  classified as Page code reload; the latter caused an App-level restart in experiments.
- HTTP publication success is not execution acknowledgement. It only means the watched file is closed; the next runtime
  version report is the proof that DevTools loaded it and React/Taro reconciliation committed.
- The runtime cannot live in a Page module because Page entries are exactly what DevTools re-executes. App-global ownership
  retains Rolldown exports, HotContext data, React families, native Page journals, and the committed version together.
- Taro's normal `onUnload` destroys context and unmounts the React root. DevTools replays that lifecycle for code reload,
  so retaining React state requires suppressing only that synthetic cycle and reattaching Taro's root to the new receiver.
- AppService properties are not browser lexical globals. Targeted AST replacement is required for generated `window` and
  React DevTools-hook probes; assigning aliases on `global` does not make free identifiers resolve.
- React Refresh's debounce is not observable by the publication protocol. Promise-backed scheduling makes Refresh and its
  before-hooks part of the commit, so a thrown exception cannot advance the runtime version past visible React state.
- Rolldown's bundled React wrapper installs each replacement `hot.accept` callback in a microtask. A rapid missing suffix
  must therefore preserve one factory/checkpoint per HostPatch; synchronous source concatenation can make patch N+1 miss
  patch N's boundary even though both programs are individually valid.
- A full physical build is intentionally the only recovery primitive. It gives DevTools a natural App restart, resets the
  build/client identity and version together, and avoids a second reset protocol that could diverge from physical code.

## Final post-research flow rerun

After preserving individual HostPatch factories, the complete DevTools flow passed again with input `246`:

1. The calculator rendered its result header (`房屋总价`) and retained input value `246`.
2. Navigation reached `pages/calculator/monthly-payments/index` with both Pages in the native stack.
3. Editing the background calculator title changed only `hmr/patches.js`.
4. The active monthly-payments Page stayed visible; App runtime identity, build ID, and both native Page identities stayed
   equal while runtime version advanced `0 → 1`.
5. Navigating back showed `房贷计算器 HMR-2026`, result header `房屋总价`, and input `246`.
6. Restoring the source again changed only `hmr/patches.js`; the same App runtime and calculator Page remained, version
   advanced `1 → 2`, the original title returned, and both result/input state remained.
7. The final DevTools console grep for errors, warnings, failed reconciliation, or rebuild requests was empty.
