# WeChat Development Architecture

## Status

This document defines the replacement WX development architecture.

The existing WX HMR implementation is not a migration constraint. It will be deleted rather than adapted. There is no compatibility layer, snapshot format, secondary HMR environment, application module loader, or legacy transport.

## Goals

The implementation must be:

- one Vite/Rolldown environment and one module graph;
- eager: App and every configured page are built before the server is ready;
- native: initial output is the normal WeChat CommonJS bundle;
- incremental: JavaScript edits use Rolldown DevEngine patches;
- safe for WeChat: executable updates are literal JavaScript files compiled by DevTools;
- compatible with React Refresh;
- restart-safe without changing the DevTools project directory;
- conservative for CSS, assets, public files, and configuration;
- small enough to understand without reconstructing a second module system.

Compatible JavaScript updates preserve React state, the native page identity, the Taro root, native input state, and route state. Incompatible React updates relaunch the active route. Module-local state is not a preservation guarantee.

## Non-goals

- Preserving every module singleton across an update.
- Sending executable code over a socket.
- Implementing an ESM runtime in WeChat.
- Reproducing Vite's module graph or invalidation algorithm.
- Incrementally applying WXSS or arbitrary emitted assets.
- Keeping any legacy HMR protocol or file format.

## Architecture

```text
Vite client environment with bundled development
                  │
                  ▼
        Rolldown DevEngine (one graph)
          │                     │
          │ initial output      │ native HMR patch
          ▼                     ▼
 normal WX CJS files     cumulative literal update.js
          │                     │
          └──────────┬──────────┘
                     ▼
          fixed dist/wx project directory
                     │
                     ▼
              WeChat DevTools
                     │
                     ▼
 custom Rolldown runtime + React Refresh + Taro lifecycle bridge
```

The same DevEngine produces both the initial bundle and subsequent patches. The initial output and patches therefore share module IDs, chunking, transforms, React instrumentation, and dependency knowledge.

There is no `wx_hmr` environment and no snapshot build.

## Server components

The Node-side implementation has four focused responsibilities.

### 1. Bundled development adapter

A narrow adapter owns all interaction with Vite's bundled-development DevEngine.

It:

- enables bundled development on the WX client environment;
- supplies all configured App and page entries eagerly;
- forces the normal WX CommonJS output layout;
- installs the WeChat-safe Rolldown runtime implementation;
- receives full output, HMR patches, and additional assets;
- creates one internal DevEngine client session;
- registers loaded module IDs with that session;
- closes the engine cleanly on server shutdown.

Any use of experimental or private Vite APIs is isolated in this adapter. The rest of the plugin only consumes a small local interface:

```ts
interface WxDevEngine {
    start(): Promise<WxFullOutput>
    onPatch(callback: (patch: WxPatch) => void): void
    registerModules(ids: Iterable<string>): void
    close(): Promise<void>
}
```

The adapter performs an explicit Vite-version capability check and fails with one actionable error if the expected bundled-development hooks are unavailable. Internal API details must not leak into transforms, output writing, or the runtime.

### 2. Output writer

The output writer writes the initial bundle to the normal, fixed WX output directory.

Rules:

- Never switch or replace the DevTools project directory.
- Write changed files through temporary sibling files followed by atomic rename.
- Track the previous output manifest and remove stale generated files.
- Preserve DevTools-owned private files.
- Emit `project.config.json` with `compileHotReLoad: true`.
- Reset the patch journal only after a complete output write succeeds.

A full output includes the custom `runtime.js` and an empty `__wx_hmr__/update.js` so both files are known to DevTools from the first compile.

### 3. Patch journal

JavaScript HMR patches are appended to an in-memory journal and rendered as one literal file:

```text
__wx_hmr__/update.js
```

Each patch has a monotonically increasing version. The generated file applies only versions newer than the current App Service version.

```js
globalThis.__WX_HMR_VERSION__ ??= 0

function applyUpdates() {
    if (globalThis.__WX_HMR_VERSION__ < 1) {
        // Literal Rolldown patch 1.
        globalThis.__WX_HMR_VERSION__ = 1
    }
    if (globalThis.__WX_HMR_VERSION__ < 2) {
        // Literal Rolldown patch 2.
        globalThis.__WX_HMR_VERSION__ = 2
    }
}

if (globalThis.__WX_BUNDLED_RUNTIME_READY__) applyUpdates()
else globalThis.__WX_PENDING_BUNDLED_HMR__ = applyUpdates
```

The file contains no `eval`, `Function`, encoded executable payload, or socket-delivered code.

The journal is restart-safe: a refreshed App Service can replay every patch since the last full output. To bound file growth, reaching either a patch-count or byte-size threshold schedules a full output rebuild and clears the journal. One constant configuration owns both thresholds.

Patch handling is serialized. A source event cannot write a patch while a full output write or another patch write is in progress.

### 4. Update classifier

The classifier makes one conservative decision:

- pure JavaScript patch: append it to the journal;
- CSS, asset, public-file, configuration, unsupported output, or ambiguous patch: perform a full WX rebuild.

Classification uses DevEngine output and affected module IDs, not source filename guesses alone. A patch containing a CSS module is a full-rebuild update even when Rolldown represents it as JavaScript calling `updateStyle`.

Build errors do not modify the last good output or patch journal. The running page remains usable, and a later valid edit can recover incrementally.

## Rolldown runtime

The generated `runtime.js` uses a small WeChat-safe subclass of Rolldown's `DevRuntime`.

It implements only the runtime surface emitted by Rolldown:

- module registration and export loading;
- ESM and CommonJS initializers inherited from Rolldown;
- module hot contexts;
- self-accept and dependency-accept callbacks;
- update application;
- no-op style hooks, because style patches are rejected by the classifier.

It does not connect to a WebSocket. The server's internal client session exists only to let DevEngine calculate boundaries.

### Stable module IDs

Every initial output module is registered with DevEngine using Rolldown's stable module ID. Absolute output paths are never substituted for these IDs.

Every patch is scanned through a small, strict parser for the module IDs passed to Rolldown initializer calls. Newly introduced IDs are registered with the DevEngine client immediately. This is required for later edits to a dependency first introduced by an earlier patch to propagate to its React boundary.

This parser recognizes only Rolldown's known initializer forms and throws on an unknown patch shape. It is not a general JavaScript parser or dependency graph.

### Runtime generation

`runtime.js` creates a fresh runtime generation whenever the full bundle is evaluated:

```js
globalThis.__WX_BUNDLED_RUNTIME_READY__ = false
globalThis.__rolldown_runtime__ = new WxRolldownRuntime(...)
```

A stale runtime from DevTools' previous compile must never receive a new full bundle's pending patches.

Each page output starts with literal top-level requires in this order:

```js
require('../../runtime.js')
require('../../__wx_hmr__/update.js')
```

The normal generated page body then follows. Top-level placement lets DevTools track `update.js` as a compiled dependency. Loading `runtime.js` first establishes the correct generation before the update file decides whether to apply or defer.

## React Refresh

React state preservation is owned by the official React Refresh runtime.

### Instrumentation

All application component modules, including JSX-free `.ts` App modules, receive Refresh instrumentation. The App entry is not special-cased by extension; it is explicitly included as a component root.

The `/@react-refresh` runtime is transformed for WeChat:

- browser-global accesses use `globalThis`;
- the normal Vite boundary validation remains in use;
- a hook runs after `performReactRefresh()`;
- registration can be temporarily blocked while DevTools re-evaluates stale original page code.

### Why registration blocking is required

When `update.js` changes, DevTools can re-evaluate the original generated page bundle after applying the Rolldown patch. That original bundle contains the previous component implementation. Without a guard, its Refresh registration overwrites the new family before Refresh commits.

The sequence is therefore:

1. Allow registration.
2. Execute the Rolldown patch synchronously.
3. Block registration from the stale original page re-evaluation.
4. Enqueue React Refresh.
5. Perform Refresh.
6. Unblock registration.

The guard affects only Refresh family registration. It does not skip normal Rolldown module registration.

### Compatible and stale updates

After Refresh:

- no stale families: flush the retained Taro root;
- one or more stale families: relaunch the active route with its query parameters.

A stale update intentionally resets component state. A compatible update must not relaunch.

## Taro and native page lifecycle

DevTools emits a synthetic `onUnload` / `onLoad` / `onShow` sequence when the shared update dependency changes. Letting Taro process that sequence destroys the retained React root and resets native state.

The lifecycle bridge is deliberately small.

### Native registration

Each native page route is registered once per runtime generation. Re-evaluating generated page code never calls `Page(...)` a second time.

### Active page tracking

The decorated page config tracks the active native page and its:

- `$taroPath`;
- `$taroParams`;
- Taro document root.

The Taro `document` import must resolve to the same browser-selected runtime module used by the WX framework bundle. It must not import a second `runtime.esm.js` instance.

### Live patch sequence

A live patch is executed synchronously when the runtime is ready:

1. Capture the active page and Taro root.
2. Flush the root once against the current native page.
3. Enable lifecycle suppression.
4. Apply the literal Rolldown patch.
5. Block stale Refresh registrations.
6. Return from `update.js`.
7. Ignore DevTools' synthetic lifecycle calls.
8. Transfer `$taroPath` and `$taroParams` to the replacement native page object created by DevTools.
9. Perform React Refresh.
10. Bind the retained Taro root to the replacement native page object.
11. Flush the root.
12. Disable temporary guards.

The native page ID and React root remain stable throughout a compatible update.

### Pending patch sequence

On a fresh runtime generation, `update.js` cannot apply before the full page module graph and React root exist.

It stores one pending apply function on `globalThis`. The decorated initial `onReady`:

1. marks the runtime generation ready;
2. removes the pending function from `globalThis`;
3. applies the cumulative journal;
4. runs the normal React/Taro refresh sequence.

This makes patch replay deterministic after App Service or simulator refresh.

## Full rebuild fallback

A full rebuild is used for:

- WXSS and CSS modules;
- imported assets;
- public files;
- app/page configuration;
- output topology changes that cannot be represented safely;
- unknown DevEngine output;
- patch journal compaction.

The rebuild uses the same WX environment and entry configuration. It writes a complete output into the existing project directory, resets the runtime generation and patch journal, and lets `compileHotReLoad` reload DevTools.

No state-preservation guarantee applies to a full rebuild.

## Failure handling

### Transform or build failure

- Keep the last good files and patch journal unchanged.
- Report the formatted error once.
- Do not request a page reload.
- Accept the next edit normally.

### Patch execution failure

- Report the error with the patch version.
- Stop applying later journal entries in that execution.
- Relaunch the active route if possible.
- Force a full rebuild on the server to establish a new baseline.

### Unsupported Vite or Rolldown shape

Fail at startup. Silent degradation to another HMR implementation is forbidden.

## Concurrency and ownership

One `WxDevServerSession` owns:

- the DevEngine adapter;
- the current full-output manifest;
- the patch journal;
- module registration;
- serialized writes;
- fallback rebuilds;
- shutdown.

The session has a single async queue. DevEngine callbacks enqueue work and never mutate output directly. Closing the Vite server closes the queue, DevEngine, and file watchers exactly once.

No other plugin or environment writes WX development output.

## Proposed source layout

The implementation should follow responsibilities rather than preserve the old layout:

```text
src/node/targets/wx/
    plugin.ts               WX target hooks
    vite-config.ts          Rolldown output and chunk layout
    virtual-modules.ts      generated App/page/component modules
    react-refresh.ts        WX-safe Refresh instrumentation and preamble
    companion-assets.ts     WXML, JSON, WXSS, and project files
    dev-server/
        session.ts                  orchestration and serialization
        vite-bundled-dev-adapter.ts isolated Vite/Rolldown integration
        bundle-output.ts            in-memory output normalization
        output-writer.ts            atomic fixed-directory writes
        module-ids.ts               stable module ID extraction
        patch-journal.ts            cumulative literal update.js
        rolldown-runtime-source.ts  self-contained module bootstrap source for runtime.js

src/runtime/wx/
    runtime-bridge.ts       Taro page/component exports used by generated entries
    hot-update-runtime.ts   React Refresh, Taro root, and lifecycle bridge
```

The `node/` and `runtime/` boundary is strict: code bundled into the Mini Program never imports Vite or Node implementation code. Small modules may be merged when a type or helper has only one caller. Avoid abstract base classes, providers, protocol layers, and files containing only re-exports.

## Replacement plan

### Phase 1: remove the old architecture

1. Delete the secondary HMR environment.
2. Delete snapshots, custom application factories, the application module loader, and the old transport.
3. Remove legacy tests and documentation tied to those concepts.
4. Leave WX production and H5 behavior unchanged.

No transitional compatibility code is added.

### Phase 2: establish one full graph

1. Add the bundled-development adapter.
2. Configure eager App/page inputs and normal WX CommonJS output.
3. Install the WeChat-safe Rolldown runtime.
4. Write the initial output into the fixed WX directory.
5. Register all initial stable module IDs.

### Phase 3: add literal JavaScript patches

1. Create the internal DevEngine client.
2. Capture native HMR patches.
3. Register patch-added module IDs.
4. Add the versioned cumulative journal.
5. Inject ordered top-level runtime/update requires.
6. Add pending `onReady` replay.

### Phase 4: integrate React and Taro

1. Apply React Refresh to App and page component modules.
2. Transform Refresh globals for WeChat.
3. Add stale-registration blocking.
4. Add native page registration and lifecycle decoration.
5. Add retained-root capture and post-Refresh flushing.
6. Add stale-family route relaunch with query preservation.

### Phase 5: conservative fallbacks

1. Classify CSS and style-runtime patches as full rebuilds.
2. Add asset, public-file, and configuration fallbacks.
3. Add journal compaction.
4. Add error recovery and forced-baseline recovery after runtime failures.

### Phase 6: remove experimental scaffolding

1. Delete debug globals, counters, logs, and proof-only transforms.
2. Keep one concise startup log and actionable errors.
3. Document the isolated Vite/Rolldown compatibility seam.

## Validation plan

All DevTools tests use one fixed project directory. Tests may refresh the simulator or App Service but must not repeatedly close and reopen different project folders.

### Automated unit tests

- stable module ID extraction;
- patch-added module registration;
- journal version guards and replay;
- journal compaction threshold;
- atomic output manifest cleanup;
- JavaScript versus fallback classification;
- pending runtime-generation behavior;
- query reconstruction;
- unsupported patch-shape failure;
- build-error preservation of the last good output.

### DevTools matrix

1. Cold eager startup of App and every configured page.
2. Compatible active-page component edit.
3. Second compatible edit to the same module.
4. New reachable dependency.
5. Later edit to that patch-added dependency.
6. Inactive-page edit followed by navigation.
7. Compatible App component edit.
8. Module-local state reset without native or React state loss.
9. Simulator/App Service refresh with multiple pending cumulative patches.
10. Incompatible Hook signature relaunch.
11. Query preservation across stale relaunch.
12. CSS full rebuild.
13. Imported asset full rebuild.
14. Public-file and configuration full rebuild.
15. Syntax error with live-page survival and recovery.
16. Server restart and clean shutdown.

For compatible updates, record and compare:

- visible updated text;
- controlled React input value;
- native input value;
- native page ID;
- `$taroPath`;
- page/global markers;
- absence of console errors.

## Acceptance criteria

The replacement is complete when:

- only one WX development module graph exists;
- initial App/page output is eager and navigation requires no first build;
- pure JavaScript edits use native Rolldown patches;
- compatible page, dependency, and App updates preserve state and page identity;
- patch-added dependencies remain incrementally editable;
- cumulative patches replay after refresh;
- stale families relaunch with query preservation;
- CSS/assets/configuration use deterministic full rebuilds;
- syntax errors preserve the last working page and recover;
- no executable socket payload, `eval`, `Function`, snapshot, or custom application module loader remains;
- plugin build, typecheck, lint, WX/H5 builds, and the complete DevTools matrix pass.
