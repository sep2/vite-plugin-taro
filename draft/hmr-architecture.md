# WeChat Development Architecture

## Status

This document defines the WX development architecture implemented by `vite-plugin-taro`.

The old secondary HMR environment, snapshots, application factories, custom application module loader, and executable socket transport are not compatibility constraints and are not retained.

## Goals

The implementation is:

- one Vite/Rolldown environment and one module graph;
- eager: App and every configured page are built before the server is ready;
- native: initial output is the normal WeChat CommonJS bundle;
- incremental: safe JavaScript edits use Rolldown DevEngine patches;
- literal: DevTools compiles executable updates from a normal JavaScript file;
- compatible with official React Refresh;
- restart-safe without changing the DevTools project directory;
- conservative for CSS, assets, public files, configuration, and ambiguous output;
- bounded during long-running development sessions.

Compatible JavaScript updates preserve React state, native page identity, the Taro root, native input state, and route state. Incompatible React updates relaunch the active route. Module-local state is not a preservation guarantee.

## Non-goals

- Preserving every module singleton across an update.
- Sending executable code over HTTP or a WebSocket.
- Using `eval`, `Function`, encoded executable payloads, or a custom module loader.
- Reproducing Vite's module graph or invalidation algorithm.
- Incrementally applying WXSS or arbitrary emitted assets.
- Keeping a legacy HMR protocol or file format.

## Architecture

```text
Vite client environment with bundled development
                  │
                  ▼
        Rolldown DevEngine (one graph)
          │                     │
          │ initial output      │ native HMR delta
          ▼                     ▼
 normal WX CJS files      retained server memory
          │                     │
          │                     ▼
          │              protocol state machine
          │                     │
          │ metadata HTTP       │ one missing-range batch
          │ poll/report         ▼
          └────────────── vpt-hmr/update.js
                                │
                                ▼
                     fixed dist/wx project directory
                                │
                                ▼
                         WeChat DevTools
                                │
                                ▼
          Rolldown runtime + React Refresh + Taro lifecycle bridge
```

The same DevEngine produces the initial bundle and every delta. Initial output and updates share module IDs, chunking, transforms, React instrumentation, and dependency knowledge.

The control channel transports only protocol metadata. Executable code never appears in an HTTP response. The server writes literal JavaScript to `vpt-hmr/update.js`, and DevTools detects and compiles that file through its native dependency graph.

## Generated development files

A full development output contains:

- `vpt-hmr/control.js`: authenticated local endpoint and full-build `buildId`;
- `vpt-hmr/preload.js`: eager initialization of every configured page component;
- `vpt-hmr/update.js`: initially `void 0;`, then one published literal batch.

`app.js` directly requires `control.js` before starting the update client. Every page entry directly requires `runtime.js`, `preload.js`, and `update.js`, in that order. The direct literal `update.js` edge is required: transitive and dynamic dependencies execute too late to suppress DevTools' synthetic page lifecycle.

There are no numbered patch files, cumulative on-disk journal, snapshots, or alternate DevTools project directories.

## Server components

### Bundled-development adapter

`vite-bundled-dev-adapter.ts` isolates all private Vite bundled-development APIs. It:

- configures eager App/page inputs and normal WX CommonJS output;
- installs the WeChat-safe Rolldown runtime;
- receives full output and native HMR output;
- owns one internal DevEngine client;
- registers initial and newly introduced stable Rolldown module IDs;
- waits for the first output before Vite reports readiness.

Unsupported private API shapes fail at startup rather than silently selecting another HMR implementation.

### Output writer

The output writer keeps one fixed WX project directory. It writes changed files through temporary sibling files followed by atomic rename, preserves partial full-build output correctly, removes stale generated output, synchronizes public files, and leaves DevTools-owned private files alone.

At development-session startup, the plugin removes its complete `vpt-hmr` directory before writing the initial output. This also removes stale files from older protocol implementations.

### Protocol server

`update-server-state.ts` is a pure deterministic state machine. `update-protocol-server.ts` adapts it to Vite's local HTTP server and the output directory.

Server state contains:

- the current full-build `buildId`;
- monotonically increasing `hostVersion`;
- all retained deltas for the current build;
- one active App Service session and retired session IDs;
- at most one in-flight batch.

The endpoint accepts authenticated `register`, `poll`, and `rebuild` reports. Polls are held for up to 25 seconds. A source change wakes a pending poll, but HTTP responses contain only values such as `changed`, `idle`, `batch-published`, or `rebuilding`.

### Update classifier

A pure JavaScript DevEngine patch is transformed for WeChat syntax and retained as the next versioned delta. CSS/style-runtime patches, assets, public files, configuration, unsupported output, and ambiguous updates request a complete WX output.

Build errors leave the last good output untouched. A later valid edit can recover incrementally.

## Stop-and-wait protocol

Only one executable batch may be in flight.

1. The App Service creates a fresh random session ID and registers its actual client version.
2. The client long-polls with `{ buildId, sessionId, version }`.
3. If the client is behind, the server creates one batch containing every retained delta from `clientVersion + 1` through `hostVersion`.
4. The server atomically rewrites only `vpt-hmr/update.js` and replies `batch-published`.
5. DevTools detects the existing direct dependency and executes the literal batch.
6. The client applies the Rolldown deltas in order, performs React Refresh, and handles any stale-family route relaunch.
7. Only after Refresh or relaunch completes does the client report the new version.
8. That report acknowledges the in-flight batch. Changes received meanwhile remain queued for the next batch.

Every publication has a fresh source nonce. If DevTools misses a file event or the HTTP response/acknowledgement is lost, the watchdog reports the unchanged client version and the server republishes the same missing range with different file content. The patch is never acknowledged merely because it was written.

Duplicate, delayed, stale-session, malformed, and ahead-version reports are handled by explicit state transitions. An irrecoverable report requests a full build rather than guessing.

### App Service restart

A fresh App Service has version zero and a new session ID. The server retires the old session and publishes every retained delta from version 1 through `hostVersion` as one literal batch. `preload.js` guarantees that configured page modules exist before replay, including routes never opened in the previous App Service.

An already-populated `update.js` can execute while registration is still pending. The client state machine queues that batch until registration completes; it does not abort registration by reporting early.

### Development-server restart

Deltas exist only in server memory. Restarting Vite creates a new `buildId` and writes a complete baseline containing the latest source graph. Old build reports cannot be acknowledged in the new epoch. `compileHotReLoad` reloads DevTools against the new full output.

### Bounded retention

A build retains at most 1,000 deltas or 16 MiB of transformed patch code. Reaching either limit requests a full output. The successful full output establishes a new `buildId`, resets versions and retained memory, and resets `update.js` to `void 0;`.

## Client state machine

`update-client-state.ts` is pure and deterministic. `update-client-runtime.ts` adapts commands to `wx.request`, literal batch execution, React Refresh, and route readiness.

Client phases distinguish registration, polling, applying, refreshing, and relaunching. The state machine guarantees:

- one transport loop;
- no concurrent patch execution;
- application only when `fromVersion` equals the actual client version;
- idempotent reporting of already-applied batches;
- acknowledgement only after Refresh completes;
- acknowledgement after a stale-family route becomes ready;
- full-build requests after literal execution failure;
- retry without version changes after transport failure.

## Rolldown runtime and stable IDs

The generated `runtime.js` uses a WeChat-safe subclass of Rolldown's `DevRuntime`. It implements the emitted module initialization, exports, hot contexts, accepted dependency callbacks, and update application. It has no WebSocket connection and no dynamic application loader.

Initial output modules and patch-added modules are registered with DevEngine using stable Rolldown IDs. A strict parser recognizes only Rolldown's known initializer forms in patch output. Newly introduced IDs are registered immediately so a later edit to a dependency first added by a patch still reaches its React boundary.

Vite's Oxc transform lowers generated runtime and patch wrappers to syntax accepted by the WeChat JavaScript parser.

## React Refresh

Official React Refresh owns compatible component-state preservation.

All application component roots, including JSX-free App modules, receive Refresh instrumentation. During a native update:

1. the Rolldown patch executes synchronously;
2. Refresh registration from DevTools' stale page re-evaluation is temporarily blocked;
3. React Refresh runs;
4. the registration guard is removed;
5. no stale family flushes the retained Taro root;
6. a stale family relaunches the active route with its query parameters.

The protocol version advances only after this sequence completes.

## Taro and native lifecycle preservation

DevTools emits synthetic `onUnload`, `onLoad`, and `onShow` calls when `update.js` changes. Processing those calls normally would destroy the retained React root and reset native state.

The update wrapper synchronously calls the lifecycle bridge before applying any delta. The bridge captures the active page and Taro root, suppresses the synthetic lifecycle, deduplicates native `Page(...)` registration, transfers Taro route fields to the replacement page object, and rebinds the retained root after Refresh.

For a compatible update, native page identity, input state, route state, Taro root, and compatible React state remain stable. Delaying suppression until after patch execution is not sufficient.

On initial App Service replay, the page may not yet be ready. The bridge stores one pending application closure and runs it from the decorated initial `onReady`, after the original page graph and Taro root exist.

## Full-build fallback and failures

A complete output is used for:

- WXSS and CSS modules;
- imported assets and public files;
- App/page/project configuration;
- unsafe or unknown DevEngine output;
- missing protocol history or invalid version reports;
- runtime patch execution failure;
- retention limits.

No state-preservation guarantee applies to a full output.

Transform/build failures preserve the last good files and retained deltas. Runtime execution failures stop that batch, request a full output, and never advance the client version.

## Ownership and source layout

One `WxDevServerSession` owns the DevEngine adapter, full-output manifest, protocol server, module registration, serialized output writes, fallback rebuilds, and shutdown.

```text
src/node/targets/wx/dev-server/
    session.ts
    vite-bundled-dev-adapter.ts
    update-server-state.ts
    update-protocol-server.ts
    bundle-output.ts
    output-writer.ts
    module-ids.ts
    javascript-compatibility.ts
    rolldown-runtime-source.ts

src/runtime/wx/
    update-client-state.ts
    update-client-runtime.ts
    hot-update-runtime.ts
    page-refresh-runtime.ts
    runtime-bridge.ts
```

Runtime modules never import Node or Vite implementation modules.

## Validation

Pure tests cover both state machines independently and together, including registration, normal acknowledgement, lost responses, deltas arriving in flight, App Service replay, retired sessions, malformed/ahead versions, stale-family relaunch, transport failure, execution failure, and full-build epoch reset.

All DevTools tests use one fixed project directory and cover:

1. eager cold startup;
2. repeated compatible active-page edits;
3. new dependencies and later edits to them;
4. inactive and never-opened routes;
5. compatible App edits;
6. rapid edits while a batch is in flight;
7. App Service restart and complete retained replay;
8. stale-family relaunch with query preservation;
9. CSS/assets/public/configuration full output;
10. syntax-error survival and recovery;
11. development-server restart;
12. automatic preview/upload parser acceptance.

The complete observed behavior and experimental lower-bound evidence are recorded in `draft/hmr-probe-result.md`.
