# WX HMR implementation research notebook

## Status and intended use

> **This is not an accepted architecture, implementation plan, or specification.**
>
> It is a research notebook assembled after several prototype implementations, source-code investigations, and manual
> WeChat DevTools experiments. Some ideas below are mutually incompatible. The proposal near the end is deliberately
> provisional and may be rejected after a clean-room implementation produces better evidence.

The expected use of this document is:

1. revert the experimental working tree;
2. implement WX HMR again from a clean starting point;
3. reproduce the observations independently;
4. use this notebook to find known traps and unanswered questions;
5. choose an architecture from fresh evidence rather than copying the previous prototype.

Do not treat a statement as a requirement merely because it appears here. Each finding is labelled by evidence type
where practical:

- **Observed**: reproduced in WeChat DevTools or by a filesystem/test probe.
- **Source evidence**: established by reading Vite, Rolldown, React Refresh, or Taro source.
- **Prototype behavior**: behavior of the discarded working implementation.
- **Hypothesis**: plausible but not yet isolated by a deterministic probe.

The existing `docs/hmr-plan.md`, `draft/hmr-architecture.md`, and `draft/hmr-probe-result.md` are separate documents.
This notebook neither supersedes nor approves them.

## Historical product target

The experiments were trying to obtain this user-visible behavior:

- one Vite development server, watcher, and Rolldown development graph;
- an initial physical WeChat Mini Program written to `build.outDir`;
- executable updates delivered through a physical file compiled by WeChat DevTools;
- ordinary accepted JavaScript updates changing only `hmr/update.js`;
- React and Taro state retained when React Refresh considers an update compatible;
- navigation-stack Pages remaining usable after an update;
- no use of `eval`, `Function`, network-delivered executable source, or global `window` emulation;
- H5 and production WX behavior remaining independent of the development implementation;
- full recovery builds remaining available when the retained runtime cannot be repaired safely.

These were historical targets, not proof that the previous implementation was the best way to achieve them.

## 1. Platform observations

### 1.1 Executable code needs a physical WeChat project file

**Observed and platform-constrained.** `wx.request` can carry metadata, but downloaded JavaScript cannot be evaluated as
new Mini Program code using web-style dynamic evaluation. A physical file watched and compiled by WeChat DevTools was
therefore used as the executable boundary.

The prototype separated transport into:

- a metadata/control channel over `wx.request`;
- an execution channel through `hmr/update.js`.

The HTTP response never carried executable patch source.

### 1.2 Page-scoped file changes can retain the App heap

The bare probes in `draft/hmr-probe-result.md` established, with `compileHotReLoad: true`, that automatically rewriting
an active `page.js` preserved the existing App identity and `globalData`. The same probe did **not** establish React,
Taro, Page-instance, input, or navigation-stack retention.

The useful boundary observed later was a file loaded directly by a Page entry through a literal dependency such as:

```js
require('../../hmr/update.js');
```

The important dirty detail is **direct and literal**:

- a path assembled at runtime is not equivalent;
- a dependency discovered only while the Page is already rerunning may be too late;
- a transitive helper that later loads `update.js` should not be assumed to create the same DevTools boundary;
- relative paths differ by Page depth and should be derived from rendered physical filenames.

A clean implementation should reprobe this boundary instead of assuming every DevTools version behaves identically.

### 1.3 The one-file observation was real

**Observed.** After an ordinary accepted source edit, filesystem timestamp/hash comparison reported only:

```text
hmr/update.js
```

The experiment initially emitted `hmr/update.js.map`, which violated the one-file invariant. Embedding the patch source
map as an inline data URI fixed that. An `onAdditionalAssets` path also caused unrelated physical writes and was removed.

The initial inert file was:

```js
module.exports = undefined;
```

A published prototype patch looked conceptually like:

```js
__rolldown_runtime__.receiveUpdate(metadata, () => {
    // Rolldown patch body
});
//# sourceMappingURL=data:application/json;base64,...
```

This shape is historical, not mandatory.

### 1.4 WXSS boundaries differ

The bare probe found:

| Changed file | Existing App retained |
| --- | --- |
| active `page.js` | yes |
| `app.wxss` | no |
| page-owned `page.wxss` | yes |

The current CSS pipeline aggregates source styles into application-level output, so source CSS HMR was deliberately
removed from the JavaScript prototype. CSS extraction, Page-WXSS duplication, CSS versioning, and style synchronization
were all tried or discussed and then discarded.

A clean implementation should keep JavaScript HMR independent from CSS until style ownership is explicitly designed.

### 1.5 DevTools diagnostics are noisy

The following messages occurred during otherwise successful workflows:

```text
[Error] Error: timeout
```

Opening a project and immediately forcing another simulator refresh could also produce:

```text
appLaunch with non-empty page stack
[Page route 错误(system error)] appLaunch with non-empty page stack
```

These are not sufficient evidence of an HMR failure. Assertions should examine the UI, page stack, runtime version,
console messages specific to the plugin, and physical file changes. Conversely, a single visually successful update is
also not enough: one duplicate-Page experiment passed once and failed later.

## 2. Vite and Rolldown development-engine findings

### 2.1 Vite bundled development normally owns a DevEngine

**Source evidence.** Vite 8.1.4 creates a bundled-development Rolldown `DevEngine` internally. The investigated Vite
commit was:

```text
a477454442eff649b430f9e3c6caf2500fcb7183
```

Relevant source:

- [`bundledDev.ts`](https://github.com/vitejs/vite/blob/a477454442eff649b430f9e3c6caf2500fcb7183/packages/vite/src/node/server/bundledDev.ts)
- [`reporter.ts`](https://github.com/vitejs/vite/blob/a477454442eff649b430f9e3c6caf2500fcb7183/packages/vite/src/node/plugins/reporter.ts)

Vite's normal engine uses a memory-oriented write policy. The prototype replaced engine creation with one owned engine:

```ts
dev(rolldownOptions, outputOptions, {
    rebuildStrategy: 'never',
    onHmrUpdates,
    onOutput,
    watch: {
        skipWrite: false
    }
})
```

The owned engine was assigned back to Vite's private `bundledDev._devEngine` field so Vite still closed it.

This private integration worked with Vite 8.1.4 but is version-sensitive. Isolate it if reused.

### 2.2 `rebuildStrategy: 'never'` was the key patch-only behavior

**Observed.** With `rebuildStrategy: 'never'`, ordinary accepted HMR tasks did not enter the complete output write path.
`skipWrite: false` still allowed:

- the initial physical build;
- explicit recovery/full builds.

Earlier implementations called `triggerFullBuild()` or `ensureLatestBuildOutput()` during normal edits. Those calls
rewrote the generated project and triggered DevTools refresh behavior, defeating state preservation.

### 2.3 Vite's stale-output HTTP regeneration was unsafe

Vite's bundled development middleware may regenerate stale output when an HTTP request asks for it. The prototype
replaced:

```ts
bundledDev.triggerBundleRegenerationIfStale = async () => false;
```

Without this, incidental browser/HTTP access could rewrite physical WX output outside the patch protocol.

### 2.4 Initial build synchronization

The successful startup barrier used:

1. initial `incremental_write()`;
2. the first successful `onOutput` callback.

A previous preparation race produced:

```text
ENOENT: no such file or directory, access '.../dist/wx/app.json'
```

The lesson is that “DevEngine created” is not the same as “all required physical initial output exists.”

### 2.5 `onHmrUpdates` carries useful native metadata

Rolldown's HMR result includes:

- `changedFiles`;
- per-client updates;
- `Patch`, `Noop`, and reload-like outcomes;
- patch code and source maps;
- `hmrBoundaries`, including `boundary` and `acceptedVia`.

The investigated Rolldown commit was:

```text
2fd5c5c4d967cd0f9e9b04cb591edaf973e52e90
```

Relevant source areas:

- [`dev-engine.ts`](https://github.com/rolldown/rolldown/blob/2fd5c5c4d967cd0f9e9b04cb591edaf973e52e90/packages/rolldown/src/api/dev/dev-engine.ts)
- [`client_hmr_update.rs`](https://github.com/rolldown/rolldown/blob/2fd5c5c4d967cd0f9e9b04cb591edaf973e52e90/crates/rolldown_common/src/hmr/client_hmr_update.rs)
- [`hmr_plugin.rs`](https://github.com/rolldown/rolldown/blob/2fd5c5c4d967cd0f9e9b04cb591edaf973e52e90/crates/rolldown_plugin_hmr/src/hmr_plugin.rs)

Rolldown 1.1.4 exposed no per-module `devMode.include`, `exclude`, or equivalent HMR instrumentation filter.

### 2.6 The development runtime executes before application module bodies

Rolldown-instrumented modules access the runtime before their original bodies, conceptually:

```js
global.__rolldown_runtime__.createModuleHotContext(...);
global.__rolldown_runtime__.registerModule(...);
// original module body
```

Therefore an ordinary application bootstrap module cannot install the runtime: instrumentation needs it first.

Approaches rejected for this reason included:

- initializing the runtime in the application App bootstrap;
- importing a private runtime module through the same instrumented graph;
- relying on a module body to define `global.__rolldown_runtime__`.

### 2.7 `devMode.implement` can install a self-contained runtime

The prototype compiled:

```text
src/runtime/wx/dev/dev-runtime.ts
    -> dist/runtime/wx/dev/dev-runtime.js
```

The Node adapter read the compiled JavaScript and supplied it directly through:

```ts
devMode: {
    lazy: false,
    implement: devRuntimeSource
}
```

Dirty details:

- the source executes in Rolldown's generated lexical runtime scope, where `DevRuntime` exists;
- runtime imports must erase completely, so only type imports are safe;
- `Function.prototype.toString()` was deliberately avoided;
- transforming `\0rolldown/runtime.js` with another plugin was rejected;
- runtime source was read eagerly and cached, so changing it required rebuilding plugin `dist` and restarting Vite;
- repository source execution therefore depended on a current `dist/runtime/wx/dev/dev-runtime.js`.

This arrangement was effective but made the runtime difficult to unit-test in isolation and coupled source development to
plugin rebuilding.

### 2.8 Module registration is client-specific

Rolldown computes HMR output for modules registered to a client. The prototype used Rolldown's `Messenger` to report
executed module IDs and then called:

```ts
await devEngine.registerModules(clientId, moduleIds);
```

This creates a major unopened-Page question: a configured Page whose application modules never execute may not be part
of the live client's update set. The old `main` implementation eagerly imported every configured Page component for
this reason. Eager preload is simple but executes module side effects before navigation. This remains a design choice,
not a settled requirement.

### 2.9 Reporter and HMR logs are separate

Rolldown's Vite reporter produces progress such as:

```text
transforming (157) ...
```

It does not automatically produce Vite's final `hmr update ...` diagnostic when a custom `onHmrUpdates` callback bypasses
Vite's normal bundled-development handler.

The prototype first invented its own formatting, then rejected that approach. It eventually delegated diagnostic
handling to Vite's existing private `BundledDev.handleHmrOutput` while suppressing Vite's browser/memory transport.
That reused Vite's native output:

```text
1:24:47 PM [vite] (client) hmr update src/pages/calculator/index.tsx
```

This is another private API dependency. A clean implementation may instead expose a smaller upstream hook or accept a
local formatter, but should make that choice explicitly.

## 3. Physical output and filesystem findings

### 3.1 Stable development names, production hashes

Stable development filenames made direct physical dependencies and repeated DevTools compilation predictable. Production
kept content hashes. Development remained minified and emitted source maps; minification reduced large CommonJS factory
output substantially.

For the sample app, an observed development application chunk was roughly:

```text
assets/app.js  ~558 kB
```

### 3.2 Source maps belong inside the one patch file

A sibling `hmr/update.js.map` causes a second physical write and a second DevTools-observed file. Inline source maps kept
the one-file boundary while retaining usable generated-code diagnostics.

### 3.3 Initial output preparation cannot blindly use Vite's private prepare plugin

Raw `vite:prepare-out-dir` can clear generated files omitted from incremental callbacks. This was particularly dangerous
because incremental output callbacks need not restate every unchanged output file.

The prototype retained custom initial output preparation and public-directory copying.

### 3.4 Public files require their own ordered synchronization

The working approach used one `SerializedTaskQueue` for:

- initial output-directory preparation;
- initial public-directory copying;
- public add/change/delete events.

Initial preparation failure was fatal. Later public synchronization failures were reported as recoverable queued-task
errors. Source changes were deliberately excluded from this filesystem queue so they could not trigger a full
rematerialization accidentally.

### 3.5 Ordinary HMR and recovery have different write guarantees

The one-file rule applied only to an ordinary accepted code patch. A recovery build was allowed to rewrite the complete
project intentionally. Conflating the two paths led to misleading tests and accidental state loss.

## 4. Control protocol findings

A physical write is not an acknowledgement. DevTools may miss, coalesce, cache, or delay the file generation.

The prototype eventually tracked:

- build ID;
- authenticated token;
- active client ID;
- client start time;
- current and next versions;
- retained patches;
- registered modules;
- retired clients;
- stale physical output;
- unapplied changes;
- one published patch awaiting acknowledgement.

### 4.1 Stop-and-wait publication

One patch range remained published until the active client reported the target version. A changed nonce made retries
physically distinct. Duplicate and stale batches were rejected by build/client/version checks.

### 4.2 Prepare before publication

A two-phase handshake was introduced:

1. server reports `prepare(targetVersion)`;
2. runtime enters its update guard and reports `preparedVersion`;
3. server writes `hmr/update.js`;
4. DevTools observes and evaluates it.

This removed a race in which DevTools could dispatch Page side effects before the runtime had captured/suppressed the
relevant state.

### 4.3 Acknowledgement timing was not fully solved

The discarded runtime advanced its version after the Rolldown patch function returned. React Refresh can enqueue work
that completes later. Therefore “patch body returned” may be earlier than “React Refresh committed and the native Page
projection was restored.”

The old `main` implementation had a stronger concept: it rewrote the Refresh runtime to receive the result of
`performReactRefresh()` and acknowledged afterward. A clean implementation should decide what completion means and test
it explicitly.

### 4.4 Runtime restart versus server restart

A fresh runtime that starts after patch-only physical output cannot safely assume the initial bundle contains all current
source. The prototype detected a new client start time after retained patches and requested a recovery build.

A server restart naturally creates a new build ID and full output. Old patch history should not cross that boundary.

### 4.5 Endpoint selection

Hardcoded `localhost`, address, and port were removed. The successful resolution order was:

1. `server.config.server.origin`;
2. `server.resolvedUrls.local[0]`;
3. `server.resolvedUrls.network[0]`;
4. the actual bound `httpServer.address()`.

No fallback port was hardcoded and `strictPort` was not forced. A real probe selected a fallback such as:

```text
http://localhost:5174/__vite_plugin_taro_wx_hmr__
```

## 5. React Refresh findings

### 5.1 Fiber state should remain owned by React

There is one application React Fiber root. React Refresh preserves compatible hook/component state by reconciling that
retained root. The Fiber graph should not be copied, serialized, or assigned to a global cache.

Fiber nodes contain renderer-owned mutable details such as alternates, lanes, host instances, and scheduler state.
Retaining a detached Fiber object is not equivalent to retaining a mounted renderer root.

### 5.2 Browser-oriented Refresh output needs narrow adaptation

Vite React transforms assume an HTML/browser preamble and include browser references. Broadly replacing every `window`
reference is unsafe because user code may intentionally access `window` and WeChat's `window` property is not a normal
writable browser global.

Observed failures included:

```text
TypeError: Cannot set properties of undefined (setting '__registerBeforePerformReactRefresh')
TypeError: Cannot set property window of #<Window> which has only a getter
```

The prototype used a targeted Babel AST rewrite that:

- removed only the exact generated preamble guard;
- redirected only Refresh runtime extension properties to a lexical `__vptReactRefreshHost`;
- installed the React renderer hook against `global`;
- preserved all user-authored `window` access;
- avoided global `$RefreshReg$` and `$RefreshSig$` aliases.

The old `main` branch instead used string replacements and `globalThis` Refresh hooks. That implementation more directly
hooked Refresh completion and stale-family results, but its rewriting was broader.

### 5.3 Compatible and stale families need different outcomes

Compatible families should update the existing Fiber root. If Refresh reports stale families, state preservation is no
longer promised. Old `main` relaunched the active route in that case.

The discarded working runtime did not have an equally explicit stale-family completion path. This should be considered an
open correctness issue in a clean implementation.

### 5.4 Hot-context behavior that was implemented successfully

The prototype supported:

- self acceptance;
- dependency acceptance;
- accepted exports;
- `dispose`;
- `prune`;
- `invalidate`;
- custom events;
- persistent `hot.data`;
- fresh `loadExports()` results.

A subtle ordering bug was fixed by disposing the previous context when `createModuleHotContext()` replaced it. Recovery
called `pruneAll()`.

These features should be tested independently from React state retention; a Refresh demo alone does not prove Vite HMR
API compatibility.

## 6. Taro and native Page findings

### 6.1 One React root does not mean one native Page projection

**Source evidence.** Taro creates one React root for `AppWrapper`, and `AppWrapper` keeps mounted Pages as children:

- [`connect.ts`, application root](https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-framework-react/src/runtime/connect.ts#L202-L267)

Each Page wrapper nevertheless renders a Taro host element named `root`:

- [`connect.ts`, Page wrapper](https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-framework-react/src/runtime/connect.ts#L135-L151)

During Page `onLoad`, Taro assigns a unique `$taroPath`, finds that host root, assigns the native Page as `ctx`, and
performs an initial update:

- [`common.ts`, Page mount](https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-runtime/src/dsl/common.ts#L125-L168)

`TaroRootElement.performUpdate()` ultimately publishes data through that Page's `ctx.setData(...)`:

- [`root.ts`](https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-runtime/src/dom/root.ts#L55-L145)

The terminology is easy to confuse:

- **React root**: one state-owning Fiber root for the application;
- **Taro Page root**: one host bridge/projection per native Page instance;
- **native Page context**: the WeChat object receiving `setData`.

A Taro Page root should not be described as another independent React root.

### 6.2 `updateChildNodes()` plus `performUpdate(true)` is a full native republish

Taro's `updateChildNodes()` enqueues a hydrated representation of the current child tree. Calling
`performUpdate(true)` then treats that payload as an initial/full Page update. The method is private in Taro's TypeScript
source but callable in emitted JavaScript; relying on it is an internal API dependency.

Source:

- [`node.ts`, child hydration](https://github.com/NervJS/taro/blob/f0e5c39d5f04290db975670411e23c3a396e15f8/packages/taro-runtime/src/dom/node.ts#L35-L53)

`performUpdate()` schedules its actual `setData` work with `setTimeout`, so calling it is not the same as knowing the
native update has completed.

### 6.3 Page entry rerun is a separate problem from Fiber refresh

Changing `hmr/update.js` can cause DevTools to rerun Page integration code. That can involve:

- executing `Page(...)` again;
- dispatching synthetic Page lifecycles;
- clearing or replacing native Page render data;
- continuing to execute stale initial bundle code after the patch body.

React may correctly preserve Fiber state while the native Page becomes blank. The two layers require separate evidence.

### 6.4 Route registration experiments were contradictory

The original route-specialized guard tracked registered routes globally. It prevented duplicate `Page(...)` calls while
allowing different configured routes.

It was removed because one manual active-Page workflow still passed. Later workflows failed, showing that the first pass
was not sufficient evidence. A route-free temporal guard that skipped `Page(...)` only during the update window passed
repeated active-Page tests, but it has an unresolved race: a route first opened during that window could have its first
registration skipped.

Old `main` generated route-aware registration directly in each Page entry:

```ts
registerWxPage('pages/calculator/index', () => Page(taroPageConfig));
```

This is simpler than a separate AST `specializePageShell` pass because the route is already known while generating the
entry. It is still global route bookkeeping and should be justified by a rerun probe.

### 6.5 Synthetic lifecycles need careful timing

The prototype routed native Page shell callbacks through a development lifecycle coordinator. During the update window,
ordinary synthetic Page callbacks were suppressed while `eh` remained callable.

A two-phase prepare handshake made suppression active before the file write. Release was delayed by a fixed one second in
one prototype. That delay was robust in manual tests but heuristic and could suppress a legitimate user navigation.

Old `main` used Page-config decorators, a `WeakSet` of ignored synthetic Page instances, and one next-macrotask release.
It was more lifecycle-aware but more coupled to Taro's generated config shape.

### 6.6 Active-Page preservation was not enough for the back stack

The following regression was reported and reproduced:

1. enter loan amount `100`;
2. calculate and see the result header;
3. navigate to History;
4. edit the Calculator button while History is active;
5. History remains usable;
6. navigate Back;
7. Calculator is blank.

An active-root-only coordinator captured History, not Calculator. The single React Fiber root survived, but the hidden
Calculator native projection was not fully republished before it became visible again.

### 6.7 Stack-wide root restoration fixed the observed regression

A prototype snapshotted every `getCurrentPages()` entry and its Taro Page root during prepare, then called
`updateChildNodes()` and `performUpdate(true)` for every retained Page before and after the patch.

That passed the history/back workflow and retained:

- loan amount `100`;
- result header;
- monthly payment;
- updated button text.

However, it performs a full native `setData` for hidden Pages on every update. Work grows with stack depth and the design
mixes state retention with native projection recovery.

### 6.8 Removing Page-root republishing reproduced the blank Page

A later controlled experiment removed all Taro Page-root access and relied only on the application React root plus
Refresh. The exact History -> update -> Back workflow produced a completely blank Calculator Page. No button element was
found.

This is strong evidence that, with the tested DevTools/Taro combination, retained Fiber state alone does not reconstruct
a native Page projection that DevTools cleared. It does **not** prove that every Page root must be eagerly republished on
every patch.

### 6.9 Same-route multiple instances remain a special case

`$taroPath` is intended as a Page-instance identity, while a configured route identifies a Page definition. A route-level
registration set and an instance-level native projection map solve different problems. A clean test should push the same
route twice with different query parameters and verify both instances after HMR and Back navigation.

## 7. What remote `main` did

Remote `main` was inspected at:

```text
f484078ef3d81fbb4a6439f13565f95ceff64aa8
```

The relevant implementation is:

- [`page-update.ts`](https://github.com/sep2/vite-plugin-taro/blob/f484078ef3d81fbb4a6439f13565f95ceff64aa8/packages/vite-plugin-taro/src/runtime/wx/page-update.ts)
- [`update-client.ts`](https://github.com/sep2/vite-plugin-taro/blob/f484078ef3d81fbb4a6439f13565f95ceff64aa8/packages/vite-plugin-taro/src/runtime/wx/update-client.ts)
- [`react-refresh.ts`](https://github.com/sep2/vite-plugin-taro/blob/f484078ef3d81fbb4a6439f13565f95ceff64aa8/packages/vite-plugin-taro/src/node/targets/wx/react-refresh.ts)
- [`virtual-modules.ts`](https://github.com/sep2/vite-plugin-taro/blob/f484078ef3d81fbb4a6439f13565f95ceff64aa8/packages/vite-plugin-taro/src/node/targets/wx/virtual-modules.ts)

Main's notable choices:

- it tracked one lifecycle-derived `activePage`;
- it looked up only the active Page's Taro root;
- it republished that root before and after Refresh;
- it generated route-aware Page registration;
- it eagerly imported configured Page component modules;
- it observed the actual `performReactRefresh()` result;
- it acknowledged only through the Refresh completion path;
- it relaunched the active route for stale families.

Advantages over the discarded prototype:

- exact Refresh synchronization rather than a fixed delay;
- explicit stale-family fallback;
- robust route-aware registration;
- simpler active-Page cost;
- explicit readiness for a Page whose config has not completed `onReady`.

Limitations relevant to the newly reported workflow:

- it stores only one pending Page/root;
- its public README promises the active native Page, not an already-mounted hidden back-stack Page;
- it does not mark a hidden Page projection stale and resynchronize it on return;
- source inspection found no navigation-stack regression test.

The best parts of `main` and the best parts of the later prototype need not be adopted as one package. They are independent
ideas.

## 8. Provisional proposal: generation-based native Page projections

> **Proposal only. This has not been implemented or validated end to end. It may be rejected.**

The goal is to retain one application Fiber root without eagerly republishing every hidden native Page after every edit.

### 8.1 Model

Treat native Page render data as a projection/cache of the retained React/Taro tree:

```text
one React Fiber root, generation N
├── Calculator Fiber
└── History Fiber

native projections
├── Calculator rendered at generation N - 1
└── History rendered at generation N
```

A Page root is looked up only when its native projection needs to be synchronized. The coordinator does not own or copy
Fiber state and does not retain a global collection of Taro roots.

### 8.2 Minimal coordinator state

A possible coordinator needs only concepts similar to:

```ts
class PageProjectionCoordinator {
    generation = 0;
    pendingGeneration?: number;
    updating = false;
    activePage?: WxPage;

    readonly renderedGeneration = new WeakMap<WxPage, number>();
    readonly registeredRoutes = new Set<string>();
}
```

This sketch is illustrative, not an API recommendation.

### 8.3 One Taro bridge installed by the App capsule

Instead of every Page capsule registering `document`, the App-side Taro capsule could install one bridge:

```ts
function syncPage(page: WxPage): void {
    if (!page.$taroPath) return;

    const pageRoot = document.getElementById(page.$taroPath);
    if (!pageRoot) return;

    pageRoot.ctx = page;
    pageRoot.updateChildNodes();
    pageRoot.performUpdate(true);
}
```

The bridge exposes a capability, not the document or a persistent root collection.

### 8.4 Proposed update sequence

1. The control protocol announces `prepare(targetVersion)`.
2. The coordinator records the active Page, starts lifecycle suppression, and assigns a pending generation.
3. The server writes only `hmr/update.js`.
4. Rolldown updates the retained module registry.
5. React Refresh reconciles the one application Fiber root.
6. An exact `afterRefresh` hook advances the generation.
7. The active Page projection is republished and marked current.
8. Lifecycle suppression ends in the next native task.
9. The client acknowledges only after this completion path.

If Refresh reports stale families, relaunch the active route instead of pretending state was retained.

### 8.5 Hidden Pages become dirty implicitly

A hidden Page is stale when:

```ts
renderedGeneration.get(page) !== generation
```

It is not eagerly republished after every patch.

Before a Back transition exposes it, or as an `onShow` fallback:

```ts
function syncIfStale(page: WxPage): void {
    if (renderedGeneration.get(page) === generation) return;
    syncPage(page);
    renderedGeneration.set(page, generation);
}
```

One possible pre-display point is the outgoing Page's real `onUnload`, where the next Page can be inferred from
`getCurrentPages()`. A defensive `onShow` synchronization would still be needed.

### 8.6 Page registration can be generated, not specialized afterward

The Page route already exists in plugin options. A development Page entry can be generated directly:

```ts
registerRoute('pages/calculator/index', () => {
    Page(createPageShell(loadPageCapsule));
});
```

This avoids a separate `specializePageShell` AST pass while retaining idempotent route registration.

### 8.7 Unopened Pages

A development-only App preload can import configured Page component modules without creating native Page instances. This
makes their source modules visible to the live HMR client. First native `onLoad` then performs the normal full render at
the current generation.

This is the simplest known unopened-Page story, but it eagerly executes module side effects and should be evaluated
against alternatives.

### 8.8 Expected cost

The intended native work is:

```text
one full active-Page projection per accepted update
+
one deferred full projection for each stale Page when it next becomes visible
```

This is less eager than refreshing the entire stack and more complete than refreshing only the Page that happened to be
active during the patch.

### 8.9 Unresolved risks in the proposal

The proposal should not be accepted without probes for:

- whether `onUnload` occurs early enough to republish the next Page without a white frame;
- whether `getCurrentPages()` ordering is stable at that point;
- same-route multiple Page instances;
- switch-tab, redirect, relaunch, and native header Back transitions;
- legitimate navigation during the short suppression window;
- Page roots whose `ctx` was replaced by synthetic DevTools lifecycles;
- whether hidden mounted Fibers always receive Refresh updates;
- whether Taro queues enough host mutations for a deferred full republish;
- how to acknowledge actual asynchronous `setData` completion;
- how stale-family relaunch interacts with patch versions;
- the cost and side effects of eagerly importing unopened Page modules.

If any of these become more complex than stack-wide republishing, the supposedly simpler proposal may not be simpler in
practice.

## 9. Rejected or abandoned approaches

These are not permanently forbidden, but they failed or complicated the previous investigation.

### 9.1 Copying Fiber state to a global

Rejected because Fiber is renderer-owned mutable state and because the observed blank Page can occur while Fiber state
still exists. The missing artifact is the native Page projection, not necessarily React state.

### 9.2 Assigning or emulating global `window`

Rejected. WeChat's `window` can be read-only and broad aliases corrupt user semantics. Refresh adaptation should target
known generated code only.

### 9.3 App bootstrap installs the Rolldown runtime

Rejected because module instrumentation accesses the runtime before the App module body runs.

### 9.4 Transforming the Rolldown runtime module through the application graph

Rejected because the runtime itself then participates in the instrumented graph it must initialize. A second resolver,
bootstrap, and delegation layer also produced too many moving parts.

### 9.5 `Function.prototype.toString()` runtime serialization

Rejected as fragile and unnecessary. A normally compiled self-contained runtime gave better source control and source
maps.

### 9.6 Final-chunk AST removal of runtime instrumentation

Rejected because it relied on generated-code shapes and could silently remove the wrong runtime calls.

### 9.7 Ordinary full builds for source edits

Rejected because they rewrite App-level files, cause DevTools reloads, and destroy the retained heap.

### 9.8 Output snapshots and full rematerialization after every callback

Rejected because they duplicated Rolldown's write ownership, made stale/omitted outputs hard to reason about, and changed
unrelated physical files.

### 9.9 Network-delivered executable code

Rejected by Mini Program execution constraints. HTTP remained metadata-only.

### 9.10 CSS/WXSS HMR mixed into JavaScript HMR

Rejected for the initial implementation because application-level WXSS changes reload the App and the source CSS
pipeline had no reliable Page ownership.

### 9.11 Blindly trusting one successful manual update

Rejected by experience. Duplicate Page registration and root-free Refresh both had workflows that appeared successful
before a navigation or repeated run exposed failure.

## 10. Suggested clean-room investigation order

This is a research sequence, not an implementation mandate. Each step should produce a small probe and a written
observation before the next layer is added.

### Phase A: re-establish bare DevTools boundaries

- Verify `compileHotReLoad: true` behavior with the currently installed DevTools/base library.
- Change only a Page JavaScript file.
- Change a direct literal dependency of the Page.
- Compare direct versus transitive dependencies.
- Record App, Page, module, and native-view identities.
- Test a two-Page stack, not only one active Page.

### Phase B: create one initial physical DevEngine build

- One Vite server and one DevEngine.
- Verify shutdown ownership.
- Verify startup waits for required files.
- Verify public-directory initialization and live synchronization.
- Do not implement HMR publication yet.

### Phase C: run a non-React physical patch

- Register one executed module with Rolldown.
- Obtain one patch.
- Write only `hmr/update.js`.
- Confirm the existing App heap remains.
- Confirm stale initializers do not overwrite the patched module.

### Phase D: establish reliable versioning

- Build/client identity.
- Prepare-before-publish.
- One in-flight range.
- Retry with changed nonce.
- Duplicate and stale-batch rejection.
- New runtime and server-restart recovery.

### Phase E: integrate React Refresh

- Preserve user-authored `window` access.
- Install the renderer hook before React renderer initialization.
- Verify compatible and stale family outcomes separately.
- Define acknowledgement at actual Refresh completion.

### Phase F: make Page rerun harmless

- Measure which Page entries and lifecycles rerun.
- Test route registration separately from lifecycle suppression.
- Test active Page identity before and after the update.
- Avoid adding Page-root repair until the native failure is reproduced.

### Phase G: navigation-stack correctness

Test at least:

```text
Calculator state -> History -> edit Calculator -> Back
```

Compare:

- active-only root republish;
- stack-wide republish;
- generation-based deferred republish.

Capture screenshots, page IDs, `$taroPath`, lifecycle order, root `ctx`, and `setData` timing.

### Phase H: unopened and repeated routes

- Edit an unopened configured Page, then open it.
- Push the same route twice with different query parameters.
- Update a shared dependency while both instances exist.
- Navigate backward through every retained instance.

### Phase I: failure and recovery

- Throw during patch evaluation.
- Miss a physical file event.
- Restart DevTools while the server retains patches.
- Restart Vite.
- Change a file that has no acceptable HMR boundary.
- Trigger a stale React family.

### Phase J: enforce output isolation

For an ordinary accepted update, compare every physical file before and after and require exactly:

```text
hmr/update.js
```

Run this after source maps, reporters, public files, Tailwind, and recovery logic exist; early isolated success is not
enough.

## 11. Regression matrix worth keeping

### Runtime/UI

- active Page: enter input, calculate, edit component, retain input and result;
- active Page: repeat several edits without manual refresh;
- two-Page stack: update while second Page is active, then Back;
- three-or-more-Page stack;
- same route pushed more than once;
- unopened Page edited before first navigation;
- App component edit while a nested Page is active;
- shared component used by several mounted Pages;
- compatible Refresh family;
- stale Refresh family;
- module `dispose`, persistent `hot.data`, and `prune`;
- custom `accept`, `acceptExports`, and dependency acceptance.

### Delivery/protocol

- selected Vite port differs from configured/default port;
- configured `server.origin`;
- local and network resolved URLs;
- missed update-file event and retry;
- duplicate patch evaluation;
- stale and retired clients;
- client restart after patch-only changes;
- server restart;
- publication watchdog;
- patch exception and recovery;
- control endpoint authentication.

### Filesystem

- only `hmr/update.js` changes for ordinary code HMR;
- patch source map is inline;
- no `hmr/update.js.map`;
- public add/change/delete ordering;
- initial cleanup does not delete incrementally omitted generated files;
- recovery may rewrite the complete project;
- development filenames remain stable;
- production filenames remain hashed.

### Graph/output

- output-only and synthetic modules;
- generated subpackages;
- cross-package cycles;
- dynamic imports;
- modules never executed by the active route;
- large CommonJS dependency factories;
- H5 production and development behavior remains unchanged.

## 12. Known resolved errors and what they taught

These errors occurred during the broader WX architecture/HMR investigation:

```text
Error: Can't resolve 'tailwindcss/theme.css' in '.../packages/loan-genius'
```

Tailwind resolution needed the application/project basedir rather than an internal plugin path.

```text
TypeError: Cannot set properties of undefined (setting '__registerBeforePerformReactRefresh')
TypeError: Cannot set property window of #<Window> which has only a getter
```

Browser-global emulation is not a valid Refresh strategy.

```text
ReferenceError: System is not defined
SystemJS failed to initialize in the WeChat runtime
Unknown System module: vpt:/assets/bootstrap-....js
```

Runtime initialization order and canonical module identity matter before HMR is considered.

```text
TypeError: (0 , t.t) is not a function
TypeError: (0, e.n) is not a function
```

Stale or incorrectly published module namespaces can look like application errors. Patch replacement must preserve live
binding/namespace semantics.

```text
TypeError: Cannot read properties of undefined (reading 'getElementById')
```

The Taro document is a module export, not a browser-global document. The prototype solved this by explicitly registering
that export. The provisional proposal would instead install one App-owned synchronization capability.

```text
ENOENT: no such file or directory, access '.../dist/wx/app.json'
```

Initial output readiness needs a real DevEngine output barrier.

## 13. Open questions

The clean implementation should answer these with evidence:

1. Does one shared `hmr/update.js` invalidate native render data for every loaded Page or only selected Pages?
2. Which exact synthetic lifecycle sequence occurs for active and hidden Pages?
3. Is route registration deduplication necessary if publication begins before DevTools invalidation?
4. Can a legitimate Page navigation occur during suppression without being lost?
5. Can a hidden Page be resynchronized before it becomes visible with no white frame?
6. Is stack-wide republishing cheap enough that deferred generations are unnecessary complexity?
7. Can Taro expose a supported full-Page synchronization API instead of calling private `updateChildNodes()`?
8. What event proves native `setData` completion strongly enough for acknowledgement?
9. Should stale React families relaunch only the active route or request a full physical recovery?
10. How should patches for unopened modules be represented without eager side effects?
11. Does a client need every module registered, or can the custom runtime retain initializers for unexecuted modules?
12. What happens when the same route has several live `$taroPath` instances?
13. How do generated subpackages and asynchronous physical loaders affect patch availability?
14. Can Vite expose its HMR diagnostic path without invoking private `BundledDev.handleHmrOutput` side effects?
15. Is `rebuildStrategy: 'never'` stable enough to build upon across the intended Vite/Rolldown versions?
16. Which recovery writes trigger App replacement in each supported DevTools renderer and base-library version?

## 14. Closing guidance

The strongest conclusions from the experiments are narrow:

- state-preserving React HMR requires retaining the existing application Fiber root;
- executable patches must cross a DevTools-compiled physical boundary;
- ordinary full output writes destroy that advantage;
- React state retention and native Page projection recovery are different problems;
- active-Page success does not prove navigation-stack correctness;
- physical publication needs acknowledgement and recovery, not just a file write;
- one successful manual update is insufficient evidence.

Everything else—including active-only roots, stack-wide roots, generation-based projections, route registration shape,
runtime placement, and exact protocol classes—should remain open to redesign.
