# vite-plugin-taro WX Architecture v2

## Status

This document defines the greenfield architecture for the WX-only version of `vite-plugin-taro`.

It intentionally has no compatibility requirements with existing versions of the plugin or with their generated output. The only
source-level conventions retained are the normal Taro React conventions: the App and each Page default-export a React component.

## Scope

The initial implementation supports:

- WeChat Mini Programs using ordinary, non-independent subpackages;
- Vite 8 and Rolldown;
- React with one App-owned React root;
- synchronous native `App()` and `Page()` registration;
- SystemJS as the application module loader;
- static imports and Vite-supported dynamic imports across every package boundary;
- arbitrary ESM-valid import cycles, including cycles crossing generated subpackages;
- Vite-compatible JavaScript HMR and React Refresh in WeChat DevTools;
- automatic code-only subpackages for dynamically imported JavaScript.

The initial implementation does not support:

- independent subpackages;
- user-authored native `Component()` entries;
- native hooks whose result must be returned synchronously;
- lazy WXSS, WXML, or asset delivery;
- state-preserving HMR for native configuration or application-wide styles;
- compatibility with existing plugin APIs or generated files.

Page-owned WXSS hot reload is supported by WeChat DevTools and is a planned extension, but it is not part of the initial implementation.

## Platform constraints

The design starts from four non-negotiable constraints:

1. `App()` and `Page()` must be called synchronously while their native entry files execute.
2. Native module loading requires statically visible literal paths.
3. Ordinary subpackages may depend on the main package, while synchronous dependencies between subpackages are forbidden.
4. New JavaScript received over HTTP cannot be evaluated. Executable development updates must first be written into the Mini Program
   project and compiled by WeChat DevTools.

WeChat's asynchronous `require` capability is used for cross-package JavaScript transport. The minimum supported base library can
therefore assume subpackage asynchronization support; compatibility with older base libraries is not a goal.

## User API

The user configures only the App entry and page paths in `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import { vitePluginTaro } from 'vite-plugin-taro';

export default defineConfig({
    plugins: [
        vitePluginTaro({
            app: 'src/app.ts',
            pages: [
                { path: 'pages/home/index' },
                { path: 'pages/account/index' }
            ]
        })
    ]
});
```

The App module default-exports its component:

```tsx
export default function App({ children }) {
    return children;
}
```

Each configured page path resolves through Vite under the project source root using Vite's supported source extensions. The same path
is emitted as the native route:

```tsx
// src/pages/home/index.tsx
export default function HomePage() {
    return <View>Home</View>;
}
```

The order of `pages` is preserved in `app.json.pages`; consequently, the first path is the default home page unless WeChat is given an
explicit generated `entryPagePath` in a future extension.

There are no user-facing `defineApp()`, `definePage()`, package declarations, lifecycle declarations, or manual chunk declarations.
The plugin owns all native facades, package planning, lifecycle bridges, and framework activation modules.

## Architectural layers

The runtime is split into three strict layers:

```text
┌───────────────────────────────────────────────────────────────┐
│ Native synchronous shell                                     │
│ app.js, page.js, bootstrap, literal native code transport     │
└──────────────────────────────┬────────────────────────────────┘
                               │ System.import()
┌──────────────────────────────▼────────────────────────────────┐
│ SystemJS application module runtime                           │
│ resolution, linking, execution, cycles, dynamic import        │
└──────────────────────────────┬────────────────────────────────┘
                               │ activate(host)
┌──────────────────────────────▼────────────────────────────────┐
│ React/Taro adapter                                             │
│ one App root, page mounting, lifecycle and event dispatch     │
└───────────────────────────────────────────────────────────────┘
```

Only the bootstrap and native code transport use WeChat's module system directly. Every application module, including React, the
renderer, the user App, pages, and application dependencies, is resolved and evaluated by SystemJS.

## SystemJS runtime

### One application realm

All ordinary subpackages share one SystemJS instance hosted by the main package. There is one application module namespace and one
instance of every module. Modules are never duplicated merely to satisfy package boundaries.

This is essential for:

- singleton identity;
- React and renderer identity;
- live bindings;
- cycles crossing generated packages;
- consistent dynamic import caching;
- React Refresh family identity.

Package boundaries are delivery boundaries, not module-graph boundaries.

### Custom host hooks

The runtime is built from the SystemJS core and registry behavior, not the browser script-tag loader. It supplies WX-specific hooks:

```ts
interface WxSystemHost {
    resolve(specifier: string, parentId?: string): string;
    instantiate(id: string, parentId?: string): Promise<SystemRegistration>;
    createContext(id: string): SystemContext;
}
```

`resolve()` is synchronous and operates on canonical module URLs. `instantiate()` delegates to the current code transport:

- the generated literal native transport for the initial build and production;
- a transient `update.js` delivery batch for a versioned HMR module;
- an acknowledged on-demand development delivery when the physical capsule is stale.

SystemJS's own registry is the only persistent module-instance store. The architecture does not maintain a second persistent
registration catalog, mutate evaluated modules, or delete modules during HMR.

### Canonical IDs

Module identity is independent from the native path used to fetch its capsule. Canonical IDs use URL-like values so relative imports can
be resolved consistently:

```text
wx:/main/modules/app.js
wx:/dynamic/p_a1b2/modules/editor.js
/src/components/card.tsx?t=1730000000000   // development HMR generation
```

A build manifest maps initial canonical IDs to literal native paths. HMR generations use Vite-style query timestamps and are delivered
through `update.js`.

### Native registration capsules

The postprocessor converts ESM into the System registration format and then wraps it as a native CommonJS capsule. A capsule contains an
inert registration; requiring the capsule does not execute the application module body:

```js
module.exports = [
    ['wx:/main/modules/dependency.js'],
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

The native CommonJS wrapper is only transport. Dependency resolution, declaration, linking, execution order, live bindings, and cycles
remain SystemJS responsibilities.

### Literal native transport

The plugin generates a switch-based transport. Runtime IDs may be dynamic, but every native path in every branch is a compile-time
literal:

```js
function loadRegistration(id) {
    switch (id) {
        case 'wx:/main/modules/app.js':
            return Promise.resolve(require('./capsules/app.js'));

        case 'wx:/dynamic/p_a1b2/modules/editor.js':
            return require.async('../dynamic/p_a1b2/capsules/editor.js');

        default:
            return Promise.reject(new Error(`Unknown System module: ${id}`));
    }
}
```

The callback form of asynchronous `require` may be used where it gives better error information. The generated call still contains a
literal path.

No application module emits native `require()` calls.

### Cross-package cycles

Cross-package imports require no special graph transformation. For a cycle between lazy modules A and B:

1. SystemJS creates A's load record.
2. A's registration declares B.
3. The literal transport asynchronously downloads B's generated package and returns B's registration.
4. B declares A.
5. SystemJS reuses A's existing load record.
6. It links declarations and setters before executing the cycle in System order.

The generated native transport may cross package boundaries asynchronously, but neither A nor B performs a native cross-subpackage
`require()`.

"Arbitrary cycles" means every cycle that is valid under ESM evaluation semantics. The loader cannot make an application-level deadlock,
such as mutually awaited dynamic imports, terminate when native ESM would also deadlock.

## Automatic package planning

### All pages are main-package pages

Every configured native page is emitted in the main package. `app.json.pages` contains the complete configured page list. User pages are
never moved into subpackages.

### Only dynamic JavaScript is lazy

Package classification is based on graph reachability, not filenames:

1. Start from the App implementation entry and every Page implementation entry.
2. Traverse static import edges.
3. Place the entire statically reachable closure in the main package.
4. Crossing a dynamic import edge enters the lazy graph.
5. Modules reachable only through lazy boundaries are eligible for generated subpackages.
6. If any module is also statically reachable from an eager entry, it remains in the main package.

```text
App and every Page
    ├── static import ───────────────────────────────▶ main
    └── import() ────────────────────────────────────▶ lazy graph
                                                            ├── static closure
                                                            └── import() ▶ deeper lazy graph
```

A static dependency of a lazy module can remain lazy because loading and execution are already behind a dynamic boundary. A lazy module
may statically depend on a main module without duplication.

### Generated code-only subpackages

Lazy JavaScript chunks are assigned to generated code-only subpackages:

```json
{
    "root": "__dynamic__/p_a1b2",
    "name": "dynamic-p_a1b2",
    "pages": []
}
```

Code-only packages with an empty `pages` array have been verified against WeChat DevTools and are an explicit platform assumption of this
architecture.

Package names and roots are derived deterministically from their dynamic roots and chunk graph, not from content hashes alone. Stable
names reduce unnecessary package churn between builds.

### Planner goals

Correctness is independent from the exact lazy-package grouping because every cross-package edge is supported. The planner is therefore
free to optimize for:

- package-count limits;
- per-package and total package-size limits;
- minimizing the number of package downloads for one dynamic boundary;
- keeping a dynamic entry's static closure together where practical;
- avoiding unnecessary movement of stable chunks between builds.

A first implementation may group each dynamic entry and its private static closure, then merge shared lazy chunks according to package
size and co-reachability. It must never duplicate a module to improve placement.

If the eager static closure exceeds the main-package limit, the build fails with a graph report. It does not silently move statically
imported code behind an asynchronous boundary.

### Resources remain eager

For the initial implementation, automatic subpackaging applies only to JavaScript:

- WXSS, WXML, and referenced assets are materialized in the main package;
- dynamic JavaScript can reference runtime resource identifiers already represented by the main package;
- the package planner tracks JavaScript and resource ownership separately.

This separation leaves room for a future lazy-resource transport without changing System module identity.

## Build pipeline

### Shared front half

Both development and production use Vite's normal resolution and transformation pipeline:

- aliases and package exports;
- TypeScript and JSX transformation;
- React plugin transformation and React Refresh instrumentation;
- CommonJS interoperability;
- Vite-supported dynamic import variables;
- `import.meta.glob`;
- virtual modules and plugin transforms;
- CSS and asset analysis.

The plugin does not introduce a second source resolver.

### Production granularity

Production uses the normal Vite 8/Rolldown bundle and chunk graph:

```text
source modules
    → Vite/Rolldown transforms
    → tree shaking and code splitting
    → ESM output chunks
    → System-register postprocessor
    → native capsules
    → automatic package planner and literal transport
```

Application module IDs at runtime correspond to output System chunks. Rolldown remains responsible for production tree shaking,
chunking, dynamic-import lowering boundaries, and asset generation.

### Development granularity

Development preserves one System module per Vite module:

```text
source module
    → normal Vite dev transform
    → one System registration
    → one initial native capsule or one update.js registration
```

This preserves Vite's module IDs, HMR accept boundaries, `import.meta.hot` ownership, and React Refresh semantics. Development and
production intentionally have different module granularity while sharing the same SystemJS linking semantics.

### System-register postprocessor

Rolldown does not currently emit SystemJS. ESM output is therefore passed through one isolated post-processing boundary:

```ts
interface SystemRegisterPostprocessor {
    transform(input: {
        code: string;
        id: string;
        map?: SourceMap;
        mode: 'development' | 'production';
    }): Promise<{
        registration: SystemRegistrationSource;
        map?: SourceMap;
    }>;
}
```

The initial backend can use Babel's SystemJS module transform because it already implements live exports, re-exports, dynamic import,
`import.meta`, top-level await, and circular binding semantics. A small AST pass then:

- assigns or rewrites the canonical module ID;
- turns the generated registration into the native capsule representation;
- normalizes dependency IDs;
- chains source maps.

Nothing outside this boundary depends on Babel. A future native Rolldown System output can replace the postprocessor without changing the
runtime, package planner, facades, or HMR protocol.

## Generated native facades

### App facade

The generated `app.js` is synchronous:

```js
const runtime = require('./__taro__/bootstrap.js');

App(runtime.createAppFacadeConfig({
    moduleId: 'wx:/main/entries/app.js'
}));
```

`createAppFacadeConfig()` immediately starts `System.import()` but returns the native App configuration synchronously.

The async App implementation entry is generated by the plugin and exports an activation function:

```ts
export interface AppActivationModule {
    activate(host: AppFacadeHost): AppController | Promise<AppController>;
}
```

The virtual activation module imports:

- the user's default-exported App component;
- React;
- the Taro renderer and runtime adapter;
- framework support modules.

The native facade never imports or understands React directly.

### One App-owned React root

The App controller creates and permanently owns one React root. The user's App component is the root component, and mounted pages are its
children.

```ts
interface AppController {
    mountPage(session: PageSession, component: React.ComponentType): Promise<PageController>;
    unmountPage(session: PageSession): Promise<void>;
    dispatchAppLifecycle(event: FacadeEvent): void;
}
```

Consequences:

- App React context naturally reaches every page;
- App component state and the page Fiber trees share one retained tree;
- `onHide` does not unmount a page;
- `onUnload` removes that page from the root;
- React Refresh can update App, Page, and shared components against the same Fiber tree.

### Page facade

Every generated page entry is also synchronous and directly requires the fixed development execution file:

```js
const runtime = require('../../__taro__/bootstrap.js');

require('../../__taro__/update.js');

runtime.registerPageFacade('pages/home/index', function () {
    Page(runtime.createPageFacadeConfig({
        route: 'pages/home/index',
        moduleId: 'wx:/main/entries/pages/home/index.js',
        initialData: { root: { cn: [] } }
    }));
});
```

In production, `update.js` is an inert generated file and can be removed by a production-specific page template if DevTools behavior does
not require a stable dependency. In development it exists from the initial build and is always a direct literal dependency of every page.

`registerPageFacade()` makes page entry re-execution idempotent during DevTools hot reload. Re-executing a page entry must not:

- register the route twice;
- replace the App controller;
- recreate the React root;
- remount an already mounted page;
- restore stale module implementations.

### Page sessions

The Page facade creates one session per native Page instance:

```ts
type PageSessionState =
    | 'loading'
    | 'active'
    | 'hidden'
    | 'cancelling'
    | 'unloaded'
    | 'failed';

interface PageSession {
    id: string;
    route: string;
    nativeInstance: WechatMiniprogram.Page.Instance<Record<string, unknown>, Record<string, unknown>>;
    state: PageSessionState;
    events: FacadeEvent[];
    activation: Promise<PageController>;
    cancellation: AbortController;
}
```

The implementation module import begins as early as page entry evaluation. `onLoad` binds the native instance and creates the session.
Page activation waits for both:

- the App controller and React root;
- the page implementation module.

Lifecycle events arriving before activation are journaled in native arrival order.

If `onUnload` arrives before activation completes, the session is cancelled:

```text
loading ── onUnload ──▶ unloaded
```

The module import may finish and remain cached globally, but the cancelled session does not mount, replay lifecycle events, or retain the
native Page instance.

For an active session, `onUnload` is dispatched and the App controller removes the page from the root.

## Lifecycle and event behavior

Lifecycle behavior follows Taro semantics, not Taro's current implementation structure.

The facade supplies the standard App lifecycle bridge and Taro's WX Page lifecycle surface automatically. The user does not declare
which hooks are used.

Core Page lifecycle ordering is:

```text
onLoad → onShow → onReady → onHide/onShow cycles → onUnload
```

Additional non-returning Taro page callbacks, such as pull-down refresh, reach-bottom, page scroll, resize, and tab-item callbacks, are
forwarded through the same dispatcher. Mount-dependent callbacks are deferred until page activation, matching Taro's behavior.

The generated `eh` method remains the single native template event bridge into the Taro event system.

The initial version deliberately excludes callbacks whose native return value affects synchronous WeChat behavior, including:

- `onShareAppMessage`;
- `onShareTimeline`;
- `onAddToFavorites`;
- `onSaveExitState`;
- any future callback with equivalent synchronous return requirements.

If the compiler can identify an unsupported hook usage, it emits a build diagnostic. Such hooks are not registered optimistically because
merely registering some of them changes native UI behavior.

## Vite-compatible HMR

### Principle: immutable module generations

HMR does not modify SystemJS module records.

This mirrors normal Vite web HMR, where the browser imports a fresh timestamped URL and leaves the old ESM module immutable:

```text
/src/components/card.tsx
/src/components/card.tsx?t=1730000000000
```

SystemJS treats these as two distinct module identities. The old namespace remains available to existing code. The Vite HMR accept
boundary receives the fresh namespace and decides how to apply it.

There is no:

- persistent HMR definition or override map;
- `System.delete()`;
- mutation of an evaluated System module;
- custom SCC replacement algorithm;
- second Rolldown module runtime.

### Normal Vite dev server

Development uses the ordinary Vite dev server, not a custom Vite environment and not Rolldown's bundled DevEngine runtime.

The plugin integrates through normal Vite server facilities:

- `configureServer()` for startup materialization, middleware, and control endpoints;
- `server.transformRequest()` for current Vite-transformed ESM;
- Vite's normal client module graph;
- normal `hotUpdate`/`handleHotUpdate` hooks;
- the final standard Vite HMR payload produced by Vite's propagation algorithm.

A small Vite adapter observes the final client `HotPayload` and feeds it into the acknowledged HTTP delivery queue. It does not implement
a competing HMR propagation algorithm.

### Vite HMR client semantics

The Mini Program runtime uses Vite's environment-neutral HMR client behavior:

- hot contexts keyed by stable source path;
- `accept()` and `acceptExports()`;
- dependency accept callbacks;
- `dispose()` and persistent `hot.data`;
- `prune()`;
- `invalidate()`;
- ordered update queuing;
- full-reload fallback.

Only `importUpdatedModule()` is platform-specific:

```ts
async function importUpdatedModule(update: Update): Promise<ModuleNamespace> {
    const versionedId = withViteTimestamp(update.acceptedPath, update.timestamp);
    return System.import(versionedId);
}
```

The versioned module still creates its hot context using the stable source ID, not the timestamped runtime ID. This lets the new module
replace stale accept callbacks while preserving `hot.data`, exactly as on the web.

### React Refresh

Changed React modules pass through the normal Vite React transform. A component update proceeds as follows:

1. Vite computes the same accepted boundary it would compute for a browser client.
2. The plugin transforms the latest ESM module into a versioned System registration.
3. `update.js` delivers the registration and standard Vite update metadata.
4. The old module's dispose handler runs.
5. `System.import(versionedId)` evaluates the fresh module.
6. React Refresh registers the fresh component types.
7. The old accept callback receives the fresh namespace.
8. React Refresh reconciles the existing App-owned Fiber tree.
9. Component state is retained whenever React Refresh would retain it on the web.

A module-local singleton is recreated when Vite web HMR would recreate it. The architecture does not attempt additional state migration.

### `update.js` execution channel

Every page directly requires one fixed main-package file from the initial development build:

```text
__taro__/update.js
```

The development server rewrites only this executable file for JavaScript HMR and on-demand development module delivery. DevTools sees a
change to a direct page dependency, reruns page-side code, and keeps the App-owned heap, System registry, React root, and Fiber tree alive.

A delivery contains:

```ts
interface ExecutableDelivery {
    buildId: string;
    fromVersion: number;
    toVersion: number;
    nonce: string;
    registrations: VersionedSystemRegistration[];
    updates: ViteHotPayload[];
    pendingModuleResponses: PendingModuleResponse[];
}
```

Registrations belong to the current delivery batch. They are consumed by the corresponding `System.import()` operations and then released.
They are not retained as overrides for stable module IDs.

Executing the same delivery more than once is harmless because the runtime rejects already-applied versions and duplicate response
tokens.

### HTTP polling control channel

The Vite dev server hosts an HTTP control protocol used through `wx.request`. It carries metadata only; executable JavaScript always
travels through `update.js`.

The client reports:

- build ID;
- session ID;
- last fully applied version;
- loaded stable module IDs or stamps as needed;
- pending on-demand module requests;
- update success or failure.

The server retains:

- the current full-build ID;
- monotonically increasing executable-delivery versions;
- transformed update payloads;
- per-session acknowledgement state;
- at most one published unacknowledged delivery range per active session.

A file write is not an acknowledgement. The client acknowledges only after module evaluation, Vite accept callbacks, and React Refresh
complete.

If DevTools coalesces or misses a file notification, the server republishes the same missing version range with a different nonce. The
client's applied-version check prevents duplicate execution.

### Modules changed before first import

Vite web HMR ignores an update for a module that has not been loaded. This runtime does the same; it does not retain dormant patched
registrations.

A later first import must nevertheless receive current code rather than the stale initial capsule:

1. `System.import(id)` creates an instantiation request.
2. The development transport asks the HTTP control endpoint whether the initial capsule's build stamp is current.
3. If it is current, the literal native capsule is loaded.
4. If it is stale, the server queues an on-demand executable delivery.
5. DevTools reruns the current page and executes `update.js`.
6. The delivery resolves the pending instantiation token with the latest registration.
7. SystemJS links and evaluates the module normally.

The waiting import lives in the App-owned runtime and survives the page entry rerun. Page facade idempotency prevents the rerun from
altering the existing native/React integration.

All executable deliveries, whether proactive HMR updates or on-demand module responses, share the same stop-and-wait version queue.

### Circular imports during HMR

Initial and ordinary dynamic module loading use full SystemJS circular-linking semantics.

HMR follows Vite behavior rather than inventing stronger replacement semantics. If Vite marks an update as being inside a circular import
and the fresh import cannot preserve a valid execution order, the update falls back to a complete native rebuild and App reload.

### Full-rebuild boundary

The following trigger a complete native rebuild and App reload in the initial implementation:

- Vite finds no valid HMR accept boundary;
- React Refresh invalidates the boundary;
- a registration fails to compile, link, or execute;
- an HMR accept/dispose callback throws in a way that leaves the client inconsistent;
- CSS currently materialized outside a safe page-owned WXSS boundary changes;
- WXML changes;
- assets change;
- `app.json`, page JSON, or project configuration changes;
- package layout or the literal native transport must change;
- the retained delivery history exceeds its configured bound;
- the Vite development server restarts.

This is the WeChat equivalent of Vite reloading the browser page.

A future page-WXSS HMR path can use DevTools' safe page-style boundary without changing the JavaScript HMR design.

### Restart behavior

#### App or DevTools restart

A new runtime session reports its build ID and version zero. The server replays applicable updates for modules loaded by the new session.
Modules that remain unloaded are still fetched on demand later.

#### Vite server restart

The plugin creates a new full native development build and a new build ID. Old executable deliveries are never replayed across build IDs.

#### Bounded history

Delivery history is bounded. Crossing the bound creates a fresh full build and intentionally reloads the App, preventing unbounded
SystemJS timestamp generations and patch history.

## Development startup

The normal Vite dev server does not itself create a physical Mini Program, so the plugin materializes an initial development project at
server startup:

1. Resolve the configured App and Page source entries through Vite.
2. Traverse their static and Vite-discoverable dynamic import graph.
3. Transform each module through normal Vite dev transforms.
4. Postprocess each JavaScript module into a System registration capsule.
5. Generate all native facades, generic WXML, initial WXSS, and JSON.
6. Classify eager and dynamic JavaScript.
7. Generate code-only dynamic subpackages and the literal native transport.
8. Write an empty but directly required `update.js`.
9. Start the HTTP polling/control endpoints.

Dynamic modules are materialized but not evaluated. New modules introduced after startup can be delivered for the current session through
`update.js`; changes requiring new native package declarations are included in the next full development build.

## Errors and diagnostics

Errors should retain both logical and physical context. A module-load error reports:

- requested canonical ID;
- parent/importer ID;
- resolved native package and capsule path, when applicable;
- whether loading used an initial capsule, HMR delivery, or on-demand delivery;
- current build/session/delivery versions;
- the SystemJS dependency chain;
- the original source location through chained source maps.

A failed HMR transform does not overwrite the last successful executable delivery. The running application remains on the previous
version until the error is fixed or a full rebuild occurs.

## Hard invariants

The implementation must enforce these invariants with build-time assertions:

1. `App()` and every `Page()` execute synchronously from their native entry.
2. Every native `require` and asynchronous `require` path is an AST string literal.
3. Application modules contain no native module-resolution calls.
4. There is exactly one SystemJS realm and one application module instance per runtime ID.
5. No module is duplicated across generated packages.
6. All configured native pages are in the main package.
7. Only JavaScript exclusively reachable through dynamic boundaries enters generated subpackages.
8. Every initial System module ID has exactly one native capsule mapping.
9. Cross-package edges never alter logical module identity.
10. Page entry reruns cannot recreate the App root or duplicate route registration.
11. A cancelled pre-activation Page session can never mount later.
12. HMR never mutates or deletes an evaluated SystemJS module.
13. Every HMR generation has a fresh Vite-style runtime ID.
14. Executable deliveries are applied as one acknowledged version prefix.
15. Unsupported synchronous-return hooks are not silently approximated.
16. Native resource changes never masquerade as JavaScript-only HMR.

## Validation plan

### Loader unit tests

- static imports and live bindings;
- function hoisting through cycles;
- cycles crossing two or more generated packages;
- dynamic import and nested dynamic import;
- dynamic-import cycles;
- concurrent imports of one unloaded package;
- top-level await and error propagation;
- canonical relative resolution;
- one module instance across multiple importers;
- literal transport failures with complete diagnostics.

### Package-planner tests

- eager closure remains main;
- dynamic-only closure becomes lazy;
- a dynamically and statically reachable module remains main;
- shared lazy chunks are never duplicated;
- deterministic package naming;
- package-count and size-limit diagnostics;
- empty-page code-only package generation;
- every emitted native require path remains literal.

### Facade tests

- synchronous App and Page registration;
- App lifecycle journaling before activation;
- Page lifecycle ordering before and after mount;
- App readiness before Page mount;
- one App-owned React root;
- hidden pages remain mounted;
- active-page unload unmounts exactly once;
- unload-before-activation cancels without replay or mount;
- repeated page entry execution is idempotent;
- unsupported native return hooks are absent.

### HMR runtime tests

- timestamped System modules remain immutable;
- self-accept and dependency-accept behavior matches Vite;
- old dispose callback runs before fresh import;
- fresh callbacks replace stale callbacks;
- `hot.data` persists across generations;
- React component state is retained when Vite React Refresh would retain it;
- non-boundary updates force a full rebuild;
- unloaded updates are ignored;
- later first import receives current code on demand;
- duplicate deliveries are ignored;
- missed delivery is republished;
- App restart replays loaded-module updates;
- server restart creates a new build ID;
- circular-HMR failure uses the full-rebuild fallback.

### WeChat DevTools probes

These behaviors must remain covered by executable integration probes rather than assumptions:

- code-only subpackages with `pages: []`;
- literal asynchronous loading in every main/subpackage direction;
- cross-subpackage SystemJS cycles;
- direct `page.js` → `update.js` dependency preserving the App heap;
- page entry rerun behavior and route-registration guard;
- pending `System.import()` surviving the page rerun used for on-demand delivery;
- App root and React Fiber identity surviving JavaScript HMR;
- full App replacement after unsafe native-file changes;
- page-owned WXSS hot reload behavior for the future extension.

## Research basis

The architecture relies on these documented or source-verified behaviors:

- WeChat App registration: <https://developers.weixin.qq.com/miniprogram/dev/reference/api/App.html>
- WeChat Page registration: <https://developers.weixin.qq.com/miniprogram/dev/reference/api/Page.html>
- WeChat asynchronous `require`: <https://developers.weixin.qq.com/miniprogram/dev/reference/api/require>
- WeChat subpackage rules: <https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages/basic.html>
- WeChat subpackage asynchronization: <https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages/async.html>
- WeChat DevTools hot reload: <https://developers.weixin.qq.com/miniprogram/dev/devtools/hotreload.html>
- System.register semantics: <https://github.com/systemjs/systemjs/blob/9647576d43294e938ddae8fe231beb62255f4e46/docs/system-register.md>
- SystemJS custom loader hooks: <https://github.com/systemjs/systemjs/blob/9647576d43294e938ddae8fe231beb62255f4e46/docs/hooks.md>
- Vite's timestamped HMR import: <https://github.com/vitejs/vite/blob/b59a73f76f5557492d83d097bb33b3dd02f27d51/packages/vite/src/client/client.ts#L175-L199>
- Vite's environment-neutral HMR client: <https://github.com/vitejs/vite/blob/b59a73f76f5557492d83d097bb33b3dd02f27d51/packages/vite/src/shared/hmr.ts>
- Vite dynamic-import behavior: <https://github.com/vitejs/vite/blob/b59a73f76f5557492d83d097bb33b3dd02f27d51/docs/guide/features.md#dynamic-import>
- Rolldown's current output formats: <https://github.com/rolldown/rolldown/blob/111132357228f06c208af96f6f1f3c164104bdf3/packages/rolldown/src/options/output-options.ts#L53-L55>

## Summary

The architecture reduces the system to four clear responsibilities:

1. **Native facades** synchronously satisfy WeChat and journal lifecycle events.
2. **SystemJS** owns all application module resolution, linking, cycles, and dynamic imports.
3. **Rolldown plus an ESM postprocessor** produces production System chunks and development System modules.
4. **Vite HMR plus `update.js` delivery** evaluates immutable timestamped modules and lets React Refresh update the retained App-owned
   Fiber tree.

No package boundary leaks into source semantics, no HMR-specific module registry competes with SystemJS, and no asynchronous framework
initialization delays native App or Page registration.
