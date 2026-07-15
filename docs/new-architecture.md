# New `vite-plugin-taro` Architecture

## Status

This document describes a clean-sheet architecture for a new `vite-plugin-taro`. It is not a migration plan and does
not preserve compatibility with the existing plugin or runtime.

## Scope

The initial implementation has deliberately narrow platform scope:

- WeChat Mini Program only.
- Ordinary main and subpackages only.
- No independent subpackages.
- Vite 8 and Rolldown semantics.
- React with Vite-compatible React Refresh semantics.
- Modern WeChat base libraries that support asynchronous cross-package `require`.

The following native hooks are initially unsupported because their return values may be required synchronously before
an asynchronously loaded page implementation is ready:

- `onShareAppMessage`
- `onShareTimeline`
- `onAddToFavorites`
- `onSaveExitState`
- Any other hook whose synchronous return value affects native behavior

Using an unsupported hook is a build error. It is not silently registered with degraded behavior.

## Platform constraints

The architecture starts from four constraints:

1. WeChat must execute `App()` and `Page()` synchronously while evaluating their native entry files.
2. Native module loading must use literal paths such as `require('./literal.js')`.
3. Synchronous native imports cannot cross arbitrary subpackage boundaries.
4. Executable HMR code cannot arrive over HTTP and be evaluated with `eval`, `Function`, or an equivalent mechanism.

WeChat does support asynchronous cross-package module acquisition with callback-based `require` or `require.async`.
The generated transport uses that capability while keeping every native path literal.

## Architectural principles

1. **The native layer is only a synchronous shell.** It registers App and Page facades and bootstraps the runtime.
2. **SystemJS owns application module resolution.** Native `require` is a transport primitive, not the application module
   system.
3. **Package boundaries are delivery boundaries, not graph boundaries.** Every Vite-valid import is allowed regardless
   of its physical package.
4. **Every emitted module has one identity and one physical home.** Modules are never duplicated across packages.
5. **SystemJS modules are immutable after evaluation.** HMR evaluates fresh, versioned module identities exactly as web
   Vite evaluates timestamped ESM URLs.
6. **Vite owns HMR semantics.** SystemJS loads the fresh modules; Vite's HMR client chooses boundaries and invokes
   dispose and accept callbacks; React Refresh updates the retained Fiber tree.
7. **Executable development updates only travel through `update.js`.** The HTTP control channel carries metadata only.

## High-level structure

```text
Native app.js / page.js
        │
        │ synchronous literal require
        ▼
Main-package bootstrap and facades
        │
        │ asynchronous System.import()
        ▼
WxSystem
  ├── SystemJS module registry
  ├── synchronous resolver
  └── asynchronous instantiate hook
        │
        ├── production: generated literal-require transport
        ├── development base build: generated literal-require transport
        └── development updates: transient update.js delivery batch
        │
        ▼
System.register modules in any main or subpackage
```

The main package contains the only loader, facade runtime, lifecycle journal, HMR client, and React application root.
Ordinary subpackages can depend on this main-package bootstrap.

## Runtime layers

The runtime has three strict layers.

### Native facade layer

This layer is synchronously loaded with native literal `require` calls. It owns:

- `createAppFacadeConfig()`
- `createPageFacadeConfig()`
- idempotent page registration during DevTools reruns
- native lifecycle capture
- per-page-instance lifecycle queues
- the bridge to asynchronously activated application controllers

It does not import user code with native `require`.

### Module layer

This layer is a custom SystemJS build containing:

- the SystemJS core linker and evaluator
- registry support
- a WeChat-specific `resolve()` hook
- a WeChat-specific `instantiate()` hook
- a `createContext()` implementation for `import.meta`

It deliberately excludes browser script-tag and fetch/eval loaders.

SystemJS owns the semantics of:

- static imports
- dynamic `import()`
- live bindings
- re-exports
- circular references
- function hoisting through cycles
- top-level await
- `import.meta`

### Framework layer

React and the Taro-compatible renderer are normal SystemJS modules. They are activated behind framework-neutral
contracts. Neither the facade layer nor the module loader contains React-specific lifecycle logic.

```ts
export interface AppActivationModule {
    activate(host: AppFacadeHost): AppController | Promise<AppController>;
}

export interface AppController {
    dispatch(event: FacadeEvent): void;
    dispose(): void;
}

export interface PageActivationModule {
    activate(host: PageFacadeHost): PageController | Promise<PageController>;
}

export interface PageController {
    dispatch(event: FacadeEvent): void;
    dispose(): void;
}
```

A generated virtual App or Page implementation entry imports the user's component, React, the renderer, and the
framework adapter, then exports the appropriate activation function.

## Module identity

Application module IDs are canonical URL-like strings:

```text
wx:/entries/app.js
wx:/entries/sub-a/pages/index.js
wx:/chunks/react.js
wx:/sub-b/chunks/feature.js
```

Physical package paths are not application identity. A generated manifest maps canonical IDs to physical capsules.

Development HMR creates immutable timestamped identities:

```text
/@id/src/components/counter.tsx
/@id/src/components/counter.tsx?t=42
/@id/src/components/counter.tsx?t=57
```

All three may exist in the SystemJS registry simultaneously, just as timestamped URLs may coexist in the browser ESM
module map.

The stable HMR owner ID strips only the Vite HMR timestamp:

```ts
function getHotOwnerId(runtimeId: string): string {
    return removeViteHmrTimestamp(runtimeId);
}
```

`import.meta.url` continues to use the actual runtime ID, including its timestamp.

## System registration capsules

Rolldown currently emits ESM chunks. A dedicated finalizer lowers each emitted ESM module to the System.register
format. The final native capsule exports the anonymous System registration tuple expected by the custom `instantiate()`
hook:

```js
module.exports = [
    ['wx:/sub-b/chunks/dependency.js'],
    function (_export, _context) {
        let dependency;

        return {
            setters: [
                function (module) {
                    dependency = module.value;
                }
            ],
            execute: function () {
                _export('result', dependency + 1);
            }
        };
    }
];
```

The capsule does not execute application code. Native `require` only obtains this registration tuple. SystemJS performs
linking and evaluation.

There is no global `System.register` race and no persistent named-registration catalog.

## Literal native transport

The main package contains a generated dispatcher. Its input is dynamic, but every native path is a compile-time
literal:

```js
function loadNativeRegistration(id) {
    switch (id) {
        case 'wx:/chunks/app.js':
            return Promise.resolve(require('./capsules/app.js'));

        case 'wx:/sub-a/chunks/page.js':
            return require.async('../sub-a/capsules/page.js');

        case 'wx:/sub-b/chunks/feature.js':
            return require.async('../sub-b/capsules/feature.js');

        default:
            return Promise.reject(new Error(`Unknown System module: ${id}`));
    }
}
```

The callback form can be used when preferable:

```js
return new Promise((resolve, reject) => {
    require('../sub-b/capsules/feature.js', resolve, reject);
});
```

No generated code performs `require(variable)`.

### Cross-package cycles

A cycle may cross any number of package boundaries:

```text
main:A → sub-a:B → sub-b:C → main:A
```

The native transport only returns registration tuples. SystemJS creates the logical load record for each ID before
recursively linking its dependencies. Encountering `main:A` from `sub-b:C` therefore resolves to A's existing load
record and closes the cycle normally.

No source-level package edge becomes a synchronous native cross-subpackage `require`.

Package boundaries do not participate in cycle validation. Only unresolved Vite module IDs are errors.

## Production build

### Inputs

The plugin generates Rolldown inputs for:

- the asynchronous App implementation
- every asynchronous Page implementation
- required framework/runtime virtual modules

Native `app.js` and `page.js` facade files are generated separately and do not become asynchronous System modules.

### Pipeline

1. Parse the Mini Program route and package configuration.
2. Generate virtual App and Page activation entries.
3. Run the normal Vite 8/Rolldown pipeline as ESM.
4. Preserve Vite's dynamic-import-variable and `import.meta.glob` behavior exactly.
5. Assign every output chunk one physical home package.
6. Lower each ESM output chunk to System.register.
7. Rewrite the System.register wrapper into a CommonJS registration tuple.
8. Emit canonical-ID-to-capsule metadata.
9. Emit the literal native transport.
10. Emit App/Page facades and native JSON, WXML, and WXSS artifacts.

### System.register finalizer

Rolldown does not currently support `output.format: 'system'`. The architecture isolates this limitation behind one
pure compiler boundary:

```ts
interface SystemRegisterFinalizer {
    lower(input: {
        id: string;
        code: string;
        map: SourceMap | null;
    }): Promise<{
        code: string;
        map: SourceMap | null;
    }>;
}
```

The initial backend should use Babel's proven SystemJS module transform, including dynamic-import and top-level-await
syntax support, followed by a small AST rewrite from `System.register(...)` to the exported tuple. If Rolldown later
supports System output, only this backend changes.

The transformation must preserve and chain source maps.

### Package placement

Correctness does not depend on placement, but startup and package size do. The default policy is:

- App entry chunks live in the main package.
- Page entry chunks live with their native routes.
- Shared eager chunks normally live in the main package.
- Route-private and dynamically loaded chunks live with their dominant consumer.
- Every chunk has exactly one home; no package duplication is used.

Because the transport supports arbitrary asynchronous package edges, strongly connected components do not need to be
co-located.

## App facade

Generated `app.js` is synchronous:

```js
const runtime = require('./__vpt__/bootstrap.js');

App(runtime.createAppFacadeConfig({
    moduleId: 'wx:/entries/app.js',
    lifecycles: [
        'onLaunch',
        'onShow',
        'onHide',
        'onError',
        'onPageNotFound',
        'onUnhandledRejection',
        'onThemeChange'
    ]
}));
```

`createAppFacadeConfig()` starts `System.import(moduleId)` immediately but returns the native App config synchronously.

The facade has these states:

```text
loading → active
        ↘ failed
```

While loading, native callbacks are appended to a monotonic lifecycle journal. Once the App controller is active, the
facade drains the journal in native arrival order. New callbacks dispatch directly.

The App facade exposes a readiness barrier to Page activation. A Page cannot mount before App activation and replay of
all earlier App events.

Errors are never swallowed. A failed App activation records the failure, reports the complete module/import chain, and
moves the runtime to a terminal failed state.

## Page facade

Every generated page entry is synchronous and directly loads the fixed development execution channel:

```js
const runtime = require('../../__vpt__/bootstrap.js');

require('../../__vpt__/update.js');

runtime.registerPageFacade('sub-a/pages/index', function () {
    Page(runtime.createPageFacadeConfig({
        route: 'sub-a/pages/index',
        moduleId: 'wx:/entries/sub-a/pages/index.js',
        initialData: { root: { cn: [] } },
        lifecycles: [
            'onLoad',
            'onShow',
            'onReady',
            'onHide',
            'onUnload'
        ],
        methods: ['eh']
    }));
});
```

In production, `update.js` is an empty stable module or omitted through a production-only facade template. In
development, it is present from the initial build and remains a direct literal dependency of every page.

`registerPageFacade()` is idempotent. When DevTools reruns page-side code after an `update.js` change, it does not:

- register the native route twice
- recreate the App controller
- recreate the React root
- remount the retained page unnecessarily

### Per-instance sessions

A Page config may create multiple native instances over time. `createPageFacadeConfig()` therefore owns a separate
session for each native `this` value:

```ts
interface PageSession {
    nativeInstance: WechatPageInstance;
    state: 'loading' | 'active' | 'unloaded' | 'failed';
    events: FacadeEvent[];
    controller?: PageController;
}
```

`onLoad` creates the session and starts activation. Events received before activation are queued and replayed in order.
Page activation waits for the App readiness barrier.

Registration-sensitive values must be available synchronously and are embedded in the descriptor:

- initial `data`
- lifecycle presence
- native method names
- native options and behaviors when supported

Only lifecycle functions that are actually needed are emitted. For example, an unused `onPageScroll` is not registered.

## Development environment

Development uses a custom Vite `wx` environment rather than a browser environment.

It uses Vite's normal transform pipeline and module graph, including:

- aliases
- virtual modules
- dependency optimization output
- dynamic import variables
- `import.meta.glob`
- framework transforms
- React Refresh instrumentation
- `hotUpdate` plugin hooks

Development uses source-module granularity rather than production chunk granularity. Each transformed development
module becomes one System registration capsule. This gives stable HMR ownership and preserves Vite's source-level hot
boundaries.

The initial development build materializes the graph reachable from App and Page entries. Lazy modules may remain
unevaluated.

Rolldown's separate `registerFactory`/`initModule` HMR runtime is not used because it would introduce a second module
system alongside SystemJS.

## Vite-compatible HMR semantics

### Core rule

SystemJS module records are immutable after evaluation.

An update never:

- mutates an evaluated SystemJS namespace
- replaces an existing SystemJS load record
- calls `System.delete()`
- re-executes an old module identity
- stores a persistent registration override

Instead, the update evaluates a fresh timestamped module identity and passes its namespace to Vite's existing accept
boundary.

### Vite HMR client

The runtime ports or reuses Vite's environment-neutral HMR client algorithm and data model:

```ts
hotModulesMap;
disposeMap;
pruneMap;
dataMap;
customListenersMap;
ctxToListenersMap;
```

The WeChat implementation changes only module acquisition and reload behavior. The update algorithm remains:

1. Find the old owner's qualified accept callbacks.
2. Ignore the update if the owner was never loaded.
3. Run the accepted module's old dispose callback.
4. Import the fresh timestamped module.
5. Pass its namespace to qualified callbacks.
6. Preserve `hot.data` under the stable owner ID.
7. Run React Refresh.

The platform-specific import function is:

```ts
async function importUpdatedModule(update: Update): Promise<ModuleNamespace> {
    const runtimeId = appendViteHmrTimestamp(update.acceptedPath, update.timestamp);
    return System.import(runtimeId);
}
```

### Example

Initial registry state:

```text
/@id/src/components/counter.tsx
```

A source edit produces an update for timestamp 42. `update.js` delivers:

```text
/@id/src/components/counter.tsx?t=42
```

The SystemJS registry then contains two immutable modules:

```text
/@id/src/components/counter.tsx       → old namespace
/@id/src/components/counter.tsx?t=42  → fresh namespace
```

The old module's HMR callback receives the fresh namespace. Existing importers are not silently rewritten. This matches
web ESM and Vite HMR behavior.

### React Refresh

The changed module is transformed by the normal Vite React plugin before System lowering. Evaluating its timestamped
System module therefore performs the same Refresh registrations as evaluating its timestamped ESM module in a browser.

The sequence is:

1. The old App controller, React root, Fiber tree, and component state remain alive.
2. The fresh module evaluates.
3. React Refresh registers the new component implementations against stable family IDs.
4. Vite invokes the old accept callback with the fresh namespace.
5. React Refresh reconciles the retained Fiber tree.
6. State is preserved only where React Refresh would preserve it on the web.

If the module is not a valid Refresh boundary, normal Vite invalidation and reload behavior applies.

### Circular imports during HMR

Initial and future System module graphs support ESM-valid cycles across any package depth.

HMR follows Vite's behavior rather than inventing an SCC replacement algorithm. If Vite marks an update as being within
a circular import and importing the fresh boundary fails or cannot preserve execution order, the runtime performs the
configured route or full reload fallback.

This is distinct from ordinary module loading: arbitrary ESM-valid cycles remain supported, but HMR does not promise to
repair application-level deadlocks or unsafe side-effect ordering that Vite web HMR would also reject.

## HMR execution channel

### Fixed `update.js`

Every page directly requires the same main-package `update.js` from the initial development build. This establishes the
safe DevTools page-side reload boundary before any update occurs.

For a JavaScript update, the development server rewrites only `update.js`. Original native capsules, `app.js`, page
bundles, and shared chunks remain unchanged.

An update file contains:

- one or more fresh timestamped System registrations
- the corresponding standard Vite update payloads
- build, session, and patch version metadata
- no dynamically evaluated source text

Conceptually:

```js
runtime.dev.deliver({
    buildId: 'build-7',
    fromVersion: 31,
    toVersion: 32,
    modules: [
        [
            '/@id/src/components/counter.tsx?t=42',
            dependencies,
            declare
        ]
    ],
    updates: [
        {
            type: 'js-update',
            path: '/@id/src/components/counter.tsx',
            acceptedPath: '/@id/src/components/counter.tsx',
            timestamp: 42
        }
    ]
});
```

### Transient delivery batch

`deliver()` creates a temporary instantiation source for the exact runtime IDs contained in that update. The SystemJS
`instantiate()` hook consults this source while the Vite HMR client imports the timestamped modules.

```ts
async function instantiate(id: string): Promise<SystemRegistration> {
    const delivered = currentDeliveryBatch?.take(id);
    if (delivered) return delivered;

    return developmentTransport.load(id);
}
```

The server includes the static registration closure required to link the updated boundary. Once every update import has
settled, the temporary source is discarded.

This is not a second module registry:

- it exists only while applying one delivered batch
- it is keyed by fresh runtime IDs
- consumed registrations become ordinary immutable SystemJS modules
- unconsumed registrations are discarded
- it never overrides an existing module identity

Stop-and-wait delivery guarantees that only one batch is active.

## HMR control channel

The control channel uses `wx.request` and carries metadata only. It never carries executable JavaScript.

The protocol tracks:

- full-build ID
- client session ID
- monotonically increasing patch version
- the last successfully applied version
- at most one published contiguous patch range awaiting acknowledgement

A file write is not an acknowledgement. The client acknowledges only after:

1. all fresh System modules have linked and evaluated
2. Vite accept callbacks have completed
3. React Refresh has completed its update barrier

If DevTools misses or coalesces the file event, the client continues reporting the old version and the server republishes
the same range with a different file nonce. Reapplying an already completed range is harmless because version checks are
idempotent.

## Lazy modules changed after the full build

Vite web HMR ignores updates for modules that have never been loaded. A later browser import fetches the latest source
from the dev server. The WeChat runtime must reproduce that behavior without network evaluation.

It does not retain dormant update registrations in memory.

When a System import misses the registry in development:

1. The development transport reports the module ID and base-build stamp through the control channel.
2. The server decides whether the native capsule still represents the latest transformed source.
3. If current, the runtime loads the existing capsule through the literal native transport.
4. If stale or absent, the server publishes a delivery-only `update.js` containing the latest registration.
5. The pending `instantiate()` promise waits.
6. DevTools compiles and executes `update.js` through the page boundary.
7. `deliver()` satisfies the pending instantiation request.
8. The page rerun remains harmless because native facade registration is idempotent.

This is the WeChat equivalent of fetching a previously unloaded module from the Vite dev server.

The server, not the Mini Program runtime, is the authority for the latest transformed source of an unloaded module.

## HMR restart behavior

### App or DevTools restart

A new runtime session starts from the current full native build and reports a new session ID and its loaded module set.
The server republishes relevant updates from the current build's retained patch history. Updates for modules that remain
unloaded are still ignored and delivered on demand if later imported.

### Development-server restart

The server creates a new full build ID, writes a complete native output, clears `update.js`, and resets patch versions.
Old patch history is neither replayed nor trusted.

### Bounded history and registry growth

Timestamped System modules accumulate in the same way that browser HMR accumulates evaluated timestamped ESM modules.
Patch history and module generations are bounded by periodically creating a new full build and reloading the Mini
Program. The runtime does not attempt unsafe generation garbage collection during an active session.

## Full-build boundary

State-preserving JavaScript HMR is used only when the update can be represented through fresh System modules and normal
Vite HMR boundaries.

A complete native rebuild is required when an edit changes or may change:

- App or Page JSON configuration
- WXML structure generated outside a safe page update boundary
- project configuration
- native component declarations
- imported assets that require native package emission
- application-level WXSS currently emitted through `app.wxss`
- the module/package manifest used by the full native transport
- an unsupported lifecycle declaration
- an update with no valid Vite HMR boundary
- protocol state that cannot be reconciled

A failed module evaluation or React Refresh validation follows Vite's invalidation behavior and escalates to a route or
full reload as necessary.

Page-owned WXSS HMR can be added later as a separate native delivery path. It must not be conflated with JavaScript
module HMR.

## Error handling

Errors include:

- stable source ID
- timestamped runtime ID
- physical package and capsule path when applicable
- importer chain
- current build and patch versions
- linked source-map locations

The runtime distinguishes:

- native transport failure
- missing registration
- resolution failure
- linking failure
- evaluation failure
- HMR boundary invalidation
- React Refresh rejection
- protocol or delivery timeout

No failed patch is acknowledged. The server retains or republishes it until the client recovers or requests a full
build.

## Build-time invariants

The compiler verifies all of the following:

1. `App()` and `Page()` execute synchronously during native entry evaluation.
2. Every native `require` path is an AST string literal.
3. No application System module calls native `require` for application resolution.
4. Every production System ID maps to exactly one physical capsule.
5. No emitted module is duplicated between packages.
6. Every capsule exports exactly one valid System registration tuple.
7. Every dependency specifier resolves synchronously to a canonical System ID.
8. Cross-package edges are never rejected merely because of placement.
9. Facade descriptors contain only synchronously available registration data.
10. Unsupported synchronous-result hooks fail at build time.
11. Development update IDs are fresh timestamped identities.
12. HMR never mutates or deletes an evaluated SystemJS record.
13. Executable development code appears only in Mini Program project files compiled by DevTools.

## Testing strategy

### System semantics

Conformance fixtures cover:

- direct and indirect live bindings
- star and namespace re-exports
- static cycles
- dynamic-import cycles
- function hoisting through cycles
- top-level await
- import errors and cached failures
- concurrent imports of the same ID

Each fixture runs both as native ESM where possible and through WxSystem, and compares observable behavior.

### Package graph

Fixtures cover:

- main → main
- main → sub
- sub → main
- sub A → sub B
- main → sub A → sub B → main
- dynamic imports across unloaded packages
- shared singleton state across package boundaries

Generated output is parsed to prove that every native require path is literal.

### Facades

Tests verify:

- synchronous App and Page registration
- App lifecycle replay order
- Page activation after App readiness
- multiple instances of one native route
- unload while activation is pending
- activation failure
- idempotent page-side reruns
- retained React root across `update.js` execution

### HMR parity

The HMR suite mirrors Vite behavior for:

- self-accept
- accepted dependencies
- multiple accepted dependencies
- `acceptExports`
- dispose and persistent `hot.data`
- prune callbacks
- invalidate
- unaccepted updates
- unloaded modules
- later import of a changed unloaded module
- added and removed imports
- circular import warnings and fallback
- evaluation errors and recovery
- ordered multi-update batches

React fixtures verify the same state preservation or reset decisions as Vite web React Refresh for function components,
class components, hooks, custom hooks, and invalid Refresh boundaries.

### DevTools integration

Automated WeChat DevTools probes verify:

- changing `update.js` reruns page-side code without rerunning `app.js`
- App identity and global state remain stable
- the React root and Fiber tree remain reachable
- direct page dependency behavior remains stable across DevTools versions
- on-demand delivery can resolve an already pending System import
- missed file events are recovered by versioned republishing

## Explicit non-designs

The architecture does not use:

- a persistent `definitions` map beside the SystemJS registry
- a persistent HMR registration override map
- mutable or generational SystemJS module records
- `System.delete()`-and-reimport replacement
- direct mutation of module namespace objects
- a second Rolldown/Webpack-style runtime module registry
- eager execution of every Page or dynamic module solely for HMR
- executable code received over HTTP or WebSocket
- dynamic native `require` paths
- module duplication to avoid package boundaries

## Research references

- [WeChat App registration](https://developers.weixin.qq.com/miniprogram/dev/reference/api/App.html)
- [WeChat Page registration](https://developers.weixin.qq.com/miniprogram/dev/reference/api/Page.html)
- [WeChat module `require` and asynchronous cross-package loading](https://developers.weixin.qq.com/miniprogram/dev/reference/api/require)
- [WeChat subpackage reference rules](https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages/basic.html)
- [WeChat subpackage asynchronization](https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages/async.html)
- [WeChat DevTools hot reload](https://developers.weixin.qq.com/miniprogram/dev/devtools/hotreload.html)
- [System.register semantics](https://github.com/systemjs/systemjs/blob/9647576d43294e938ddae8fe231beb62255f4e46/docs/system-register.md)
- [SystemJS loader hooks](https://github.com/systemjs/systemjs/blob/9647576d43294e938ddae8fe231beb62255f4e46/docs/hooks.md)
- [SystemJS linking and evaluation core](https://github.com/systemjs/systemjs/blob/9647576d43294e938ddae8fe231beb62255f4e46/src/system-core.js)
- [Vite timestamped HMR module import](https://github.com/vitejs/vite/blob/b59a73f76f5557492d83d097bb33b3dd02f27d51/packages/vite/src/client/client.ts#L175-L199)
- [Vite environment-neutral HMR client](https://github.com/vitejs/vite/blob/b59a73f76f5557492d83d097bb33b3dd02f27d51/packages/vite/src/shared/hmr.ts)
- [Vite dynamic import behavior](https://github.com/vitejs/vite/blob/b59a73f76f5557492d83d097bb33b3dd02f27d51/docs/guide/features.md#L646-L662)
- [Rolldown output formats](https://github.com/rolldown/rolldown/blob/111132357228f06c208af96f6f1f3c164104bdf3/packages/rolldown/src/options/output-options.ts#L53-L55)
- [Rolldown's currently unsupported System output tests](https://github.com/rolldown/rolldown/blob/111132357228f06c208af96f6f1f3c164104bdf3/packages/rollup-tests/src/ignored-by-unsupported-features.md#L106-L123)
