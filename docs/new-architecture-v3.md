# vite-plugin-taro WX Architecture v3

## Status

This document defines the greenfield architecture for the WX-only version of `vite-plugin-taro`.

There are no compatibility requirements with previous plugin APIs, generated files, package layouts, or runtime bootstrap
implementations. The design keeps the Taro React programming model while replacing the build, loading, native registration, package
planning, and development runtime architecture.

The initial implementation supports:

- WeChat Mini Programs using ordinary, non-independent subpackages;
- Vite 8 and Rolldown;
- user-owned React 19 or newer;
- plugin-owned React transforms and React Refresh integration;
- plugin-owned Taro APIs, components, renderer, and runtime integration;
- plugin-owned Tailwind CSS and WeChat Tailwind adaptation;
- synchronous native `App()` and `Page()` registration;
- one App-owned React root;
- SystemJS as the only application module loader;
- static imports and every dynamic-import form supported by Vite;
- imports across every generated package boundary;
- every import cycle valid under ESM evaluation semantics;
- automatic code-only subpackages for lazy JavaScript;
- JavaScript HMR and React Refresh in WeChat DevTools;
- stable development module IDs with `System.delete()` replacement and live-binding reconnection.

The initial implementation does not support:

- independent subpackages;
- user-authored native `Component()` entry modules;
- native lifecycle hooks whose result must be returned synchronously;
- remote JavaScript evaluation;
- compatibility with user-installed `@tarojs/*` packages;
- user-controlled chunk or native subpackage placement.

## Design principles

1. Native package boundaries are delivery boundaries, never source-level module boundaries.
2. Native registration is synchronous; application activation is asynchronous.
3. SystemJS owns application module identity, linking, execution, live bindings, and cycles.
4. Every native code-loading path is generated as an AST string literal.
5. Application modules never call native `require()`.
6. The plugin owns framework and style integration so applications install no Taro or Tailwind packages.
7. Development modules retain stable IDs and are replaced transactionally through `System.delete()`.
8. React Refresh validates a fresh module before its exports are reconnected to the running ESM graph.
9. Unsafe infrastructure updates perform a full native reload rather than approximating hot replacement.
10. Production output is optimized for delivery; development output is optimized for module identity and HMR.

## Platform constraints

The architecture starts from four non-negotiable constraints:

1. `App()` and `Page()` must be called synchronously while their native entry files execute.
2. Native module loading requires statically visible literal paths.
3. Ordinary subpackages can use the main package, while synchronous dependencies between subpackages are forbidden.
4. JavaScript received through HTTP cannot be evaluated as executable Mini Program code.

Cross-package JavaScript transport uses WeChat's asynchronous `require` support. The minimum supported base library can assume
subpackage asynchronization; compatibility with older base libraries is not a goal.

Development JavaScript is always written into the generated Mini Program and compiled by WeChat DevTools before execution. HTTP is a
control and acknowledgement channel, not a code-evaluation channel.

## User-facing contract

### Application dependencies

The application owns React. The plugin does not pin or enforce a specific React release, but its supported baseline is React 19 or
newer.

The plugin owns and ships:

- the React Vite transform and React Refresh integration;
- SystemJS;
- the Taro API implementation;
- Taro components;
- the Taro React renderer and native event bridge;
- Tailwind CSS;
- the `weapp-tailwindcss` transformation pipeline.

Applications do not install any `@tarojs/*`, Tailwind, SystemJS, or React Refresh packages.

### Virtual Taro modules

User code imports the complete Taro surface through plugin-owned virtual modules:

```tsx
import Taro, { useDidShow, useLoad } from 'virtual:taro/api';
import { Text, View } from 'virtual:taro/components';

export default function HomePage() {
    useLoad((options) => {
        console.log(options);
    });

    useDidShow(() => {
        console.log('visible');
    });

    return (
        <View className='flex min-h-screen items-center justify-center'>
            <Text onClick={() => Taro.navigateTo({ url: '/pages/account/index' })}>Open account</Text>
        </View>
    );
}
```

`virtual:taro/api` exposes the entire plugin-owned Taro API namespace as both the default export and the appropriate named exports.
`virtual:taro/components` exposes the complete component surface. The plugin supplies ambient declarations for both virtual modules.

The virtual modules resolve to normal application modules inside the SystemJS graph. They do not bypass SystemJS and do not create a
second runtime namespace.

### App and Page modules

The App and every Page default-export a React component:

```tsx
// src/app.tsx
export default function App({ children }) {
    return children;
}
```

```tsx
// src/pages/home/index.tsx
import { View } from 'virtual:taro/components';

export default function HomePage() {
    return <View>Home</View>;
}
```

There are no user-facing `defineApp()`, `definePage()`, package declarations, lifecycle declarations, native bootstrap calls, or manual
chunk declarations.

### Vite configuration

Application entries and all native App/Page JSON configuration live in `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import { vitePluginTaro } from 'vite-plugin-taro';

export default defineConfig({
    plugins: [
        vitePluginTaro({
            app: {
                entry: 'src/app.tsx',
                config: {
                    window: {
                        navigationBarTitleText: 'Example'
                    }
                }
            },
            pages: [
                {
                    route: 'pages/home/index',
                    entry: 'src/pages/home/index.tsx',
                    config: {
                        navigationBarTitleText: 'Home'
                    }
                },
                {
                    route: 'pages/account/index',
                    entry: 'src/pages/account/index.tsx',
                    config: {
                        navigationBarTitleText: 'Account'
                    }
                }
            ]
        })
    ]
});
```

The page array order determines `app.json.pages` order and therefore the default home page. The plugin owns the generated `pages` and
`subPackages` fields. User configuration cannot override those fields.

Changes to native App/Page configuration trigger a complete native rebuild.

## Tailwind and CSS

### Plugin-owned Tailwind

The plugin owns the Tailwind version and its WeChat adaptation. There is no Tailwind option object in `vite.config.ts` and no user-owned
JavaScript Tailwind configuration.

Users configure Tailwind exclusively through CSS-first directives:

```css
@import 'tailwindcss' source(none);
@source '../**/*.{ts,tsx}';

@theme {
    --color-brand: oklch(62% 0.2 265);
}
```

The plugin supports Tailwind's CSS directive surface, including directives used to import sources, define themes, add utilities, and
reference the root stylesheet.

### Root discovery

The plugin searches the App's statically reachable CSS graph for a stylesheet containing `@import 'tailwindcss'`.

- Zero roots means Tailwind is unused.
- Exactly one root enables Tailwind.
- More than one root is a build error.
- Other stylesheets can use Tailwind's `@reference` directive when required.

The Tailwind scanner always consumes original source text before the WeChat class transformation changes generated JavaScript.

### Transformation ownership

Tailwind generation and class rewriting are delegated to the plugin-owned `weapp-tailwindcss/*` pipeline. The architecture treats that
pipeline as one owned style/compiler stage and does not define a competing class encoder in the renderer.

```text
source TSX and CSS
    → Tailwind candidate discovery and generation
    → weapp-tailwindcss JavaScript/template/CSS transforms
    → React transform
    → application JavaScript and WXSS output
```

All class-name rewriting happens in the build pipeline. The React/Taro renderer does not rewrite class names at runtime.

### Production CSS

Every Tailwind and ordinary CSS contribution is flattened into one deterministic production file:

```text
app.wxss
```

No production page emits a private style bundle. CSS imported only by dynamically loaded JavaScript is still included eagerly in
`app.wxss`.

This intentionally gives CSS different loading semantics from JavaScript: JavaScript can be lazy, while all styles are available before
any dynamic component renders.

### Development CSS

The preferred development mode also regenerates one `app.wxss`. A CSS-only change must not enter the SystemJS HMR transaction and must
not emit a JavaScript full-reload payload.

When a TSX edit changes both executable code and Tailwind candidates, the update order is:

```text
compile and write WXSS
    → publish JavaScript update.js delivery
    → reconnect modules
    → perform React Refresh
```

If WeChat DevTools does not reliably retain application state while replacing global `app.wxss`, development falls back to duplicating
the complete generated stylesheet into every page's `page.wxss`. This fallback changes only development transport; production remains a
single `app.wxss`.

## Architectural layers

```text
┌────────────────────────────────────────────────────────────────────┐
│ Native synchronous shell                                           │
│ app.js, page.js, bootstrap, update.js, literal native transport    │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ System.import()
┌──────────────────────────────▼─────────────────────────────────────┐
│ SystemJS application runtime                                       │
│ identity, resolution, linking, execution, live bindings, cycles    │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ activate(host)
┌──────────────────────────────▼─────────────────────────────────────┐
│ React/Taro adapter                                                  │
│ one App root, page sessions, lifecycle and event dispatch          │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ Build-time style pipeline                                          │
│ plugin-owned Tailwind + weapp-tailwindcss → app.wxss               │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ Development control plane                                          │
│ Vite module graph, update compiler, HTTP metadata, acknowledgements │
└────────────────────────────────────────────────────────────────────┘
```

Only the bootstrap, native facades, literal transport, and development execution file use WeChat's native module system directly.
Every application JavaScript module, including React, the renderer, Taro, the App, Pages, and third-party dependencies, is instantiated
through SystemJS.

## SystemJS application runtime

### One application realm

There is exactly one SystemJS instance, hosted by the main package. Ordinary subpackages use that same instance.

This provides one application namespace and one instance of every evaluated module. Modules are never duplicated to satisfy package
boundaries.

A single realm is required for:

- React identity;
- reconciler identity;
- React Refresh family identity;
- framework and API singletons;
- live ESM bindings;
- cross-package cycles;
- dynamic import caching;
- stable HMR replacement.

### Canonical IDs

Logical module identity is independent from its physical native capsule path.

Development IDs are stable Vite-derived canonical IDs:

```text
wx:/src/app.tsx
wx:/src/pages/home/index.tsx
wx:/node_modules/react/index.js
wx:/@virtual/taro/api
```

Production IDs identify final Rolldown chunks:

```text
wx:/chunks/app.js
wx:/chunks/shared-react.js
wx:/dynamic/p_a1b2/editor.js
```

Vite resource and transform queries that identify distinct modules remain part of the canonical ID. HMR never appends a timestamp,
content hash, or generation query to a development module ID.

The React transform uses the stable source ID when registering component families. Re-executing a module therefore registers fresh
component types under the same family identifiers.

### Custom host hooks

The runtime is built from SystemJS core and registry behavior, without the browser script loader. It provides WX-specific hooks:

```ts
interface WxSystemHost {
    resolve(specifier: string, parentId?: string): string;
    instantiate(id: string, parentId?: string): Promise<SystemRegistration>;
    createContext(id: string): SystemContext;
}
```

`resolve()` is synchronous. `instantiate()` can use:

- an initial native capsule;
- an asynchronously loaded generated package capsule;
- a transient registration from the current `update.js` transaction;
- an acknowledged on-demand development response.

SystemJS's registry is the application module-instance store. Development delivery records are transient inputs to instantiation, not a
second persistent module registry.

### Native registration capsules

The ESM postprocessor produces a System registration and wraps it as an inert native CommonJS value:

```js
module.exports = [
    ['wx:/chunks/dependency.js'],
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

Requiring a capsule returns its registration. It does not execute the application module body. SystemJS still owns declaration,
linking, setter propagation, execution ordering, live exports, dynamic import, and top-level await.

### Literal native transport

The plugin generates a switch transport in which every native path is an AST string literal:

```js
function loadInitialRegistration(id) {
    switch (id) {
        case 'wx:/chunks/app.js':
            return Promise.resolve(require('./capsules/app.js'));

        case 'wx:/dynamic/p_a1b2/editor.js':
            return require.async('../__dynamic__/p_a1b2/capsules/editor.js');

        default:
            return Promise.reject(new Error(`Unknown System module: ${id}`));
    }
}
```

Runtime IDs can be dynamic. Native paths cannot be dynamic.

The build validates the final JavaScript AST and fails if any native `require`, callback-form asynchronous `require`, or `require.async`
path is not a string literal.

### Cross-package imports and cycles

Every source import is valid regardless of generated package ownership. A System registration contains only canonical dependency IDs.
When a dependency belongs to another generated package, `instantiate()` asynchronously obtains its registration through the literal
native transport.

For a cycle between modules A and B in different packages:

1. SystemJS creates A's load record.
2. A's registration declares B.
3. The host asynchronously obtains B's registration.
4. SystemJS creates B's load record.
5. B declares A.
6. SystemJS reuses A's existing load record.
7. It links both declarations and their setters before executing the cycle.

Neither application module performs a native cross-package `require()`.

Cycles are supported whenever their ESM evaluation is valid. The loader does not attempt to resolve application-level deadlocks such as
mutually awaited dynamic imports that would also deadlock under native ESM.

## Automatic package planning

### Native pages

All configured native pages are emitted in the main package. Users do not assign pages to subpackages.

### Eager JavaScript

The planner begins with the generated App activation entry and every generated Page activation entry. It traverses static import edges
and places the complete eager closure in the main package.

```text
App and all Pages
    └── static imports ──▶ main package
```

If the eager closure exceeds the main-package size limit, the build fails with a graph and size report. It never silently converts a
static import into an asynchronous boundary.

### Lazy JavaScript

Crossing a Vite dynamic-import boundary enters the lazy graph:

```text
App or Page
    └── import() ──▶ lazy root
                        ├── static closure
                        └── nested import() ──▶ deeper lazy root
```

A module remains in the main package if it is statically reachable from any eager entry, even when it is also dynamically reachable.
Modules reachable only through dynamic boundaries are eligible for generated code-only subpackages.

### Code-only subpackages

Generated lazy packages use deterministic names and contain JavaScript capsules without native pages:

```json
{
    "root": "__dynamic__/p_a1b2",
    "name": "dynamic-p_a1b2",
    "pages": []
}
```

Code-only packages with empty page lists are a tested platform assumption.

### Placement goals

Correctness does not depend on a particular lazy-package grouping because all cross-package edges are supported. The planner optimizes
for:

- package-count limits;
- main, per-package, and total size limits;
- co-locating a dynamic root with its private static closure;
- minimizing downloads for one dynamic boundary;
- stable package names between builds;
- keeping strongly connected lazy regions together when practical.

A shared module is emitted exactly once. The planner never duplicates it to avoid a cross-package edge.

### Resource placement

JavaScript and native resources have separate placement rules:

- lazy JavaScript can enter generated code-only subpackages;
- all Tailwind and ordinary CSS is emitted eagerly;
- production CSS is flattened into `app.wxss`;
- generated WXML and referenced assets remain in the main package initially.

## Build pipeline

### Plugin-owned Vite integration

`vitePluginTaro()` installs the complete ordered plugin set required by the target, including:

- virtual Taro API and component modules;
- React JSX transformation;
- React Refresh instrumentation;
- plugin-owned Tailwind generation;
- `weapp-tailwindcss` source and CSS transforms;
- native configuration and facade generation;
- ESM-to-System postprocessing;
- package planning and literal transport generation;
- development update delivery.

Users do not add a separate React or Tailwind Vite plugin.

Third-party Vite plugins still participate through Vite's normal resolution, loading, transformation, and asset hooks.

### Shared front half

Development and production share Vite's normal source semantics:

- aliases and package exports;
- TypeScript and JSX;
- CommonJS interoperability;
- Vite-supported dynamic import variables;
- `import.meta.glob`;
- virtual modules;
- JSON, CSS, and asset analysis;
- user Vite plugin transforms.

The architecture does not introduce a second source resolver.

### Production JavaScript

Production uses the normal Rolldown application graph:

```text
source modules
    → Vite transforms
    → Rolldown tree shaking and code splitting
    → ESM output chunks
    → System-register postprocessor
    → final JavaScript minification
    → native registration capsules
    → package planner
    → literal transport
```

Runtime System module IDs correspond to output chunks, not individual source modules.

Rolldown does not currently emit SystemJS, so one isolated postprocessor owns the conversion:

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

The initial implementation can use Babel's SystemJS module transform, followed by a small AST pass that:

- extracts the registration rather than executing global `System.register()`;
- normalizes canonical dependency IDs;
- wraps the registration as a native capsule;
- preserves top-level await and dynamic import;
- chains source maps.

No other architecture layer depends on Babel. Native Rolldown System output can replace this boundary later.

### Development JavaScript

Development preserves one System module per Vite module:

```text
source module
    → normal Vite development transforms
    → one System registration
    → initial native capsule or update.js registration
```

This preserves Vite module graph granularity, stable source IDs, HMR boundaries, and React Refresh family identifiers.

The normal Vite dev server remains the source transformation server. The plugin uses `transformRequest()`, the Vite module graph, and
normal hot-update hooks. It does not run a second JavaScript bundler for development.

### Development startup materialization

At server startup the plugin creates a physical Mini Program project:

1. Resolve the configured App and Page entries through Vite.
2. Traverse their static and Vite-discoverable dynamic import graph.
3. Transform each JavaScript module through Vite's development pipeline.
4. Convert each transformed module into a native System registration capsule.
5. Process all CSS through the plugin-owned Tailwind and WeChat style pipeline.
6. Generate native facades, WXML, `app.wxss`, and JSON files.
7. Classify eager and lazy JavaScript.
8. Generate code-only subpackages and the literal initial transport.
9. Write an inert but directly required `__taro__/update.js`.
10. Start the development control endpoints.

Dynamic modules are materialized but not evaluated. Modules introduced after startup can be delivered through `update.js` without
changing the live native package layout. The next cold materialization replans their production-like package ownership.

## Native synchronous facades

### App facade

Generated `app.js` is intentionally small and synchronous:

```js
const runtime = require('./__taro__/bootstrap.js');

App(runtime.createAppFacadeConfig({
    moduleId: 'wx:/entries/app.js'
}));
```

`createAppFacadeConfig()` begins `System.import()` immediately and returns the native App configuration before yielding control.

The plugin-generated App activation module has this contract:

```ts
interface AppActivationModule {
    activate(host: AppFacadeHost): AppController | Promise<AppController>;
}
```

It imports the user's App component, React, the plugin-owned Taro renderer, and framework support through SystemJS. The native facade
does not understand React.

### One App-owned React root

The App controller creates one React root and retains it for the lifetime of the native App:

```ts
interface AppController {
    mountPage(session: PageSession, component: React.ComponentType): Promise<PageController>;
    unmountPage(session: PageSession): Promise<void>;
    dispatchAppLifecycle(event: FacadeEvent): void;
}
```

The user's App component is the root component. Mounted pages are its children.

Consequences:

- App React context reaches every page;
- App state and Page fibers share one retained tree;
- hiding a page does not unmount it;
- unloading a page removes only that page;
- React Refresh updates App, Page, and shared component types in the same tree.

### Page facade

Every native page entry calls `Page()` synchronously:

```js
const runtime = require('../../__taro__/bootstrap.js');

require('../../__taro__/update.js');

runtime.registerPageFacade('pages/home/index', function () {
    Page(runtime.createPageFacadeConfig({
        route: 'pages/home/index',
        moduleId: 'wx:/entries/pages/home/index.js',
        initialData: { root: { cn: [] } }
    }));
});
```

`update.js` is present only for development execution delivery. Every page has a direct literal dependency on it so WeChat DevTools can
rerun page-side code when a delivery is published.

`registerPageFacade()` makes page entry re-execution idempotent. Re-executing a page entry during HMR cannot:

- call native `Page()` twice for the live route;
- recreate the App controller;
- recreate the React root;
- remount an active Page session;
- restore an old application module.

### Page sessions

The facade creates one session per native Page instance:

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

The implementation module import begins during page entry evaluation. `onLoad` binds the native instance and creates the session. Page
activation waits for both the App controller and Page implementation module.

Lifecycle events that arrive before activation are journaled in native arrival order.

If `onUnload` arrives before activation completes, the session is cancelled. The module can finish loading and remain cached, but the
cancelled session never mounts, replays lifecycle events, or retains the native Page instance.

## Lifecycle and event behavior

Lifecycle semantics follow the Taro programming model, not a previous bootstrap implementation.

The App facade synchronously exposes and journals the standard App lifecycle surface. App lifecycle replay occurs after the App component
and framework hooks are ready. Page activation waits for the App controller and initial App lifecycle replay barrier.

Core Page lifecycle order is preserved:

```text
onLoad → onShow → onReady → onHide/onShow cycles → onUnload
```

Additional non-returning Page callbacks, including pull-down refresh, reach-bottom, page scroll, resize, and tab-item callbacks, use the
same ordered dispatcher. The generated `eh` method is the stable native template event bridge into the Taro event system.

The initial implementation does not register callbacks whose native return value affects synchronous WeChat behavior, including:

- `onShareAppMessage`;
- `onShareTimeline`;
- `onAddToFavorites`;
- `onSaveExitState`;
- future callbacks with equivalent synchronous-return requirements.

If static analysis identifies unsupported usage, the build reports it. Such hooks are never registered optimistically because their mere
presence can change native UI behavior.

## Development HMR architecture

### Stable module identities

Development HMR keeps one canonical System ID for each logical module across the entire runtime session:

```text
wx:/src/components/card.tsx
```

There are no timestamped or content-hashed HMR IDs.

Stable IDs provide two important properties:

1. SystemJS can reconnect existing ESM import setters to fresh exports.
2. React Refresh registers fresh component types under the same module-derived family identifiers.

HMR intentionally uses SystemJS's registry replacement capability rather than reproducing the browser's immutable URL cache.

### Replaceable and foundational modules

Application modules are hot-replaceable, including:

- the user's App component;
- Page components;
- shared React components;
- application stores and utilities;
- application-owned virtual modules;
- newly introduced modules and import edges.

The following foundations are never hot-replaced:

- React;
- `react-reconciler`;
- the React Refresh runtime;
- SystemJS;
- the Taro renderer;
- the native facade and bootstrap runtime.

An update that reaches a foundational module triggers a complete native reload.

### SystemJS deletion contract

The runtime owns a typed wrapper around the pinned SystemJS registry behavior:

```ts
type ReconnectImporters = () => boolean;

interface HotSystem {
    delete(id: string): false | ReconnectImporters;
    import(id: string): Promise<ModuleNamespace>;
}
```

`System.delete(id)` removes the old load record and captures its importer setters. Importing the same stable ID creates and evaluates a
fresh load record. Calling the returned function attaches the previous importers to the fresh record and pushes the fresh namespace
through their ESM setters.

A replacement is unsafe if deletion fails because the module is still executing, participating in unresolved top-level await, or is in
another unsupported loader state. Such an update performs a full reload.

### React Refresh ordering

The React transform has two separate responsibilities:

1. Fresh module execution registers component types with the React Refresh runtime.
2. The old module's HMR accept callback validates whether the fresh export shape is a safe Refresh boundary.

Export reconnection must happen after boundary validation succeeds but before React refreshes the Fiber tree:

```text
capture old accept callbacks
    → run old dispose handlers
    → System.delete(stable IDs)
    → install fresh registrations
    → System.import(stable IDs)
    → fresh component types register
    → validate every React Refresh boundary
    → if invalid: full native reload
    → reconnect existing ESM importers
    → perform queued React Refresh
    → acknowledge delivery
```

Reconnecting before validation is forbidden. An incompatible module must not leak fresh exports into the running application graph before
React requests a full reload.

Reconnection updates ESM bindings only. It does not render React, replace fibers, or migrate component state. React Refresh remains the
sole owner of component-family replacement and state preservation.

The plugin owns the React wrapper and Refresh scheduler, so it gates `performReactRefresh()` until the HMR transaction commits. The
standard boundary validator can enqueue Refresh work, but the queue is released only after all reconnect callbacks succeed.

### Hot transaction

One executable delivery can contain several related module updates. They are applied as one transaction:

```ts
interface HotModuleReplacement {
    id: string;
    registration: SystemRegistration;
}

interface HotTransaction {
    boundaries: HotBoundaryUpdate[];
    replacements: HotModuleReplacement[];
    newModules: HotModuleReplacement[];
    prunedModuleIds: string[];
}
```

The runtime applies a transaction in these phases:

#### 1. Prepare

- Verify build ID, delivery version, and transaction nonce.
- Reject foundational updates.
- Capture old HMR contexts, namespaces, accept callbacks, and dispose handlers.
- Ensure every registration required for immediate fresh linking is present or already safely loaded.
- Do not mutate the SystemJS registry yet.

A transform or dependency-preparation failure leaves the running application untouched.

#### 2. Dispose

Run the captured old dispose handlers and preserve each module's `hot.data` object under its stable source ID.

#### 3. Delete

Call `System.delete()` for every loaded replacement module before importing any replacement. Retain every reconnect callback. Deleting the
complete replacement set first allows SystemJS to link fresh cycles without accidentally selecting one stale member merely because it was
replaced later in the transaction.

New modules have no old load record and require no deletion.

#### 4. Instantiate and execute

Install the transaction registrations as transient instantiation inputs, then import the transaction roots by their stable IDs. SystemJS
links static dependencies, cycles, live exports, dynamic imports, and top-level await normally.

Fresh execution creates new HMR contexts under the same stable IDs and registers fresh React component types under the same Refresh family
identifiers.

#### 5. Validate

Invoke the captured old accept handlers with the fresh namespaces. React boundary validation compares old and fresh exports. Refresh work
can be queued but cannot execute yet.

If any validator rejects, an accept callback throws, or fresh linking/execution fails:

- do not call any reconnect callback;
- do not continue running the partially replaced graph;
- request an immediate full native rebuild and reload;
- retire the current build ID rather than acknowledging the transaction.

Fresh registrations may have executed, but a mandatory native reload discards that heap before normal application work resumes.

#### 6. Commit

Invoke all reconnect callbacks in deterministic dependency order. This pushes fresh namespaces through existing SystemJS importer setters,
including re-exports and namespace imports.

If reconnection unexpectedly fails, perform a full native reload. The runtime never reports a partially reconnected transaction as
successful.

#### 7. Refresh and acknowledge

Release the gated React Refresh queue, await Refresh completion and transaction-level accept effects, then acknowledge the delivery.

A delivery is not successful merely because `update.js` executed. Success means fresh modules executed, validation passed, importers
reconnected, React Refresh completed, and the runtime acknowledged the committed version.

### Import graph changes

Adding or removing imports is hot-replaceable whenever the affected boundary validates.

For a newly added static dependency:

1. The server includes its registration and required fresh closure in the transaction.
2. The updated importer is deleted and imported under the same stable ID.
3. SystemJS links the new dependency.
4. Validation runs.
5. Existing importers reconnect to the fresh importer namespace.

For a removed dependency, the fresh registration no longer declares it. The old module remains loaded only if another live importer still
uses it. Otherwise Vite prune semantics run its cleanup handlers and the runtime can delete its unreferenced SystemJS record without a
reconnect.

A new dynamic dependency can be delivered immediately or fetched through the on-demand development path when first imported. Native
subpackage declarations are not rewritten during the live session. The next cold materialization replans package ownership.

### Circular updates

Ordinary module loading always uses full SystemJS cycle semantics.

For HMR, all changed members present in one transaction are deleted before any are imported. Their registrations are then linked together
as a fresh graph. Reconnect callbacks run only after the full transaction validates.

If deletion, fresh execution, or boundary validation cannot establish a safe cycle update, the runtime performs a full native reload.
It does not attempt a partial SCC repair after exports have begun reconnecting.

### Unloaded modules

An HMR update for a module that has never been evaluated does not create a dormant replacement record in the SystemJS registry.

When that stable ID is first imported later:

1. `instantiate()` compares the initial capsule's source stamp with the development server's current stamp.
2. If current, it loads the literal native capsule.
3. If stale, it requests an on-demand executable delivery through the control channel.
4. DevTools executes `update.js`.
5. The delivery resolves the pending instantiation token with the current registration.
6. SystemJS links and executes the module once under its stable ID.

There is no deletion or reconnection because no old load record exists.

## `update.js` executable delivery

Every page directly requires one fixed main-package file:

```text
__taro__/update.js
```

The development server rewrites this file atomically to publish executable registrations. WeChat DevTools compiles and executes the file
through its supported hot-reload path. The plugin never evaluates downloaded source text.

A delivery has this shape:

```ts
interface ExecutableDelivery {
    buildId: string;
    version: number;
    nonce: string;
    transactions: HotTransaction[];
    pendingModuleResponses: PendingModuleResponse[];
}
```

Properties:

- `version` is a monotonically increasing delivery sequence, not a module identity.
- `nonce` ensures DevTools observes a physical file change when a delivery must be republished.
- executing the same delivery twice is harmless;
- registrations remain only until their transaction or pending instantiation consumes them;
- an applied version prefix is acknowledged only after all transactions commit.

## Development control protocol

### HTTP metadata channel

The normal Vite dev server exposes a control protocol used through `wx.request`. It transports metadata only.

The runtime reports:

- build ID;
- runtime session ID;
- last committed delivery version;
- loaded stable module IDs or source stamps;
- pending on-demand instantiation requests;
- transaction success or failure.

The server retains:

- the current build ID;
- transformed registrations and update metadata;
- a monotonic delivery sequence;
- the active runtime's acknowledgement state;
- bounded replay history.

### One active runtime session

The protocol supports one active WeChat runtime at a time. A session ID does not represent concurrent-client support.

A new session means WeChat DevTools or the App restarted and arrived with a fresh heap. The new session replaces the old active session.
The server uses the session ID to decide which acknowledged updates must be replayed and which modules need current on-demand
registrations.

There is no fairness, fan-out, or concurrent publication protocol for multiple simulator sessions sharing one `update.js`.

### Stop-and-wait publication

Only one unacknowledged delivery range is published for the active session. Rewriting `update.js` is not an acknowledgement.

If DevTools misses or coalesces a file notification, the server republishes the same version with a new nonce. The runtime ignores an
already committed version and acknowledges it again.

### Restart behavior

#### App or DevTools restart

A fresh runtime reports a new session ID and its current build ID. The server replays retained updates needed by the new runtime. Modules
that remain unloaded receive current code through on-demand instantiation later.

#### Vite server restart

The plugin creates a fresh physical development build and a new build ID. Deliveries from the previous build are never replayed.

#### Bounded history

Update history is bounded. Exceeding the bound causes a fresh materialization and complete native reload. This prevents unbounded replay
state even though stable System module IDs avoid registry generation growth.

## Full native reload boundary

A complete native rebuild and App reload occurs when:

- Vite or the framework finds no acceptable HMR boundary;
- React Refresh boundary validation fails;
- a foundational module changes;
- `System.delete()` cannot safely remove a replacement;
- fresh registration compilation, linking, or execution fails after mutation begins;
- an accept, dispose, reconnect, or Refresh step leaves the transaction unsafe;
- WXML or native JSON changes;
- App/Page routes or native configuration change;
- the initial literal transport or cold package plan must be rematerialized immediately;
- an asset change cannot be represented as a safe style-only update;
- the development server restarts;
- bounded update history is exhausted.

CSS changes use WeChat's WXSS hot replacement whenever possible. If global replacement is unreliable, the complete stylesheet is emitted
into every page WXSS during development rather than forcing every style edit through JavaScript HMR.

## Error handling and diagnostics

A module-load error reports:

- requested canonical ID;
- parent/importer ID;
- resolved physical package and capsule path;
- whether the source was an initial capsule, transaction registration, or on-demand response;
- build, session, and delivery IDs;
- the SystemJS dependency chain;
- the original source location through chained source maps.

An HMR error additionally reports:

- transaction phase;
- deleted module IDs;
- fresh modules that executed;
- boundaries that validated or failed;
- reconnect callbacks that committed;
- whether a full native reload was requested.

A transform failure before publication does not overwrite the last successful `update.js` or `app.wxss`. The running application stays
on its previous committed code.

Once registry deletion begins, any unrecoverable failure requires a full reload. The runtime never pretends that a partially mutated
System graph is healthy.

## Hard invariants

The implementation enforces these invariants with build-time assertions and runtime checks:

1. `App()` and every `Page()` execute synchronously from their native entry files.
2. Every native code-loading path is an AST string literal.
3. Application modules contain no native module-resolution calls.
4. There is exactly one SystemJS realm.
5. A logical application module has one canonical ID and one emitted owner package per build.
6. Development HMR never changes a module's canonical ID.
7. HMR replacement uses `System.delete()` before importing the same stable ID.
8. All loaded replacements in a transaction are deleted before any replacement import begins.
9. Existing ESM importers reconnect only after every boundary in the transaction validates.
10. React Refresh executes only after ESM reconnection commits.
11. A failed validation never reconnects fresh exports into the running graph.
12. Foundational modules are never hot-replaced.
13. An unsafe transaction always performs a full native reload.
14. A delivery is acknowledged only after reconnection and React Refresh complete.
15. Development delivery registrations are transient and do not form a second persistent module registry.
16. Modules are never duplicated across generated packages.
17. All configured native pages are emitted in the main package.
18. Only JavaScript exclusively reachable through dynamic boundaries enters generated subpackages.
19. Every initial System module ID has exactly one literal native capsule mapping.
20. Cross-package edges never change logical module identity.
21. Page entry reruns cannot recreate the App root or duplicate native route registration.
22. A cancelled pre-activation Page session can never mount later.
23. Production emits all Tailwind and ordinary CSS into one `app.wxss`.
24. Tailwind and class rewriting are owned by the plugin's `weapp-tailwindcss` pipeline.
25. Unsupported synchronous-return hooks are not silently approximated.
26. The development protocol has one active runtime session.

## Validation plan

### System loader tests

- static imports and live bindings;
- re-exports and namespace imports;
- function hoisting through cycles;
- cycles crossing two or more generated packages;
- dynamic and nested dynamic imports;
- dynamic-import cycles;
- concurrent imports of one unloaded package;
- top-level await and error propagation;
- canonical relative resolution;
- one module instance across multiple importers;
- literal transport failures with complete diagnostics.

### Stable-ID HMR tests

- importing the same ID after `System.delete()` evaluates the fresh registration;
- deletion returns importer reconnection capability;
- reconnect pushes fresh named, namespace, and re-exported bindings;
- dispose runs before deletion;
- fresh execution registers React component types before validation;
- invalid React boundaries never reconnect;
- reconnect runs before `performReactRefresh()`;
- React component state is retained after a valid transaction;
- App, Page, and shared component modules retain Refresh family IDs;
- multiple replacements commit as one transaction;
- changed cycles are deleted before fresh linking;
- deletion failure forces a full reload;
- linking or execution failure after deletion forces a full reload;
- foundational changes force a full reload;
- `hot.data` survives stable-ID replacement;
- accept, prune, and invalidate behavior remains deterministic;
- adding and removing imports works without changing module IDs;
- unloaded updates are not retained as dormant registry definitions;
- first import of a stale capsule receives current code on demand.

### Package planner tests

- eager closure remains in the main package;
- dynamic-only closure enters lazy packages;
- a dynamically and statically reachable module remains main;
- shared lazy modules are never duplicated;
- cross-package cycles preserve one module identity;
- deterministic package naming;
- package-count and size diagnostics;
- empty-page code-only package generation;
- every native require path remains literal.

### Facade tests

- synchronous App and Page registration;
- App lifecycle journaling before activation;
- Page lifecycle ordering before and after mount;
- App readiness before Page mount;
- one App-owned React root;
- hidden pages remain mounted;
- unload unmounts exactly once;
- unload-before-activation cancels without replay or mount;
- repeated page entry execution is idempotent;
- unsupported synchronous-return hooks are absent.

### Tailwind and CSS tests

- zero Tailwind roots disables Tailwind;
- exactly one App-reachable root activates Tailwind;
- multiple roots fail with a precise diagnostic;
- CSS-first directives are resolved by the plugin-owned Tailwind runtime;
- `weapp-tailwindcss` rewrites JavaScript classes and WXSS selectors consistently;
- dynamically imported source contributes eager production CSS;
- every production style is flattened into `app.wxss`;
- CSS-only development updates preserve the React heap;
- TSX candidate changes write WXSS before publishing JavaScript HMR;
- per-page full-CSS duplication works as the development fallback.

### Delivery protocol tests

- duplicate deliveries are ignored and acknowledged;
- missed deliveries are republished with a new nonce;
- acknowledgement occurs only after transaction commit;
- a fresh session replaces the previous active session;
- App restart replays retained committed updates;
- server restart creates a new build ID;
- pending imports survive page entry reruns;
- bounded history triggers fresh materialization.

### WeChat DevTools probes

These behaviors remain executable integration probes rather than assumptions:

- code-only subpackages with `pages: []`;
- literal asynchronous loading in every main/subpackage direction;
- cross-subpackage SystemJS cycles;
- direct `page.js` to `update.js` dependency preserving the App heap;
- page entry rerun and route-registration guarding;
- pending `System.import()` surviving an on-demand delivery rerun;
- `System.delete()` replacement followed by importer reconnection;
- App root and React Fiber identity surviving valid HMR;
- invalid Refresh boundary causing full App replacement;
- global `app.wxss` replacement preserving application state;
- complete page-WXSS duplication fallback.

## Research basis

The architecture relies on these documented or source-verified behaviors:

- WeChat App registration: <https://developers.weixin.qq.com/miniprogram/dev/reference/api/App.html>
- WeChat Page registration: <https://developers.weixin.qq.com/miniprogram/dev/reference/api/Page.html>
- WeChat asynchronous `require`: <https://developers.weixin.qq.com/miniprogram/dev/reference/api/require>
- WeChat subpackage rules: <https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages/basic.html>
- WeChat subpackage asynchronization: <https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages/async.html>
- WeChat DevTools hot reload: <https://developers.weixin.qq.com/miniprogram/dev/devtools/hotreload.html>
- System.register semantics:
  <https://github.com/systemjs/systemjs/blob/9647576d43294e938ddae8fe231beb62255f4e46/docs/system-register.md>
- SystemJS custom loader hooks:
  <https://github.com/systemjs/systemjs/blob/9647576d43294e938ddae8fe231beb62255f4e46/docs/hooks.md>
- SystemJS registry deletion and importer reconnection:
  <https://github.com/systemjs/systemjs/blob/9647576d43294e938ddae8fe231beb62255f4e46/src/features/registry.js#L64-L93>
- Vite's environment-neutral HMR client:
  <https://github.com/vitejs/vite/blob/b59a73f76f5557492d83d097bb33b3dd02f27d51/packages/vite/src/shared/hmr.ts>
- React Refresh wrapper registration and boundary validation:
  <https://github.com/vitejs/vite-plugin-react/blob/8ae5449be23079dd17fdefc64064a3d94be6fc39/packages/common/refresh-utils.ts#L20-L64>
- React Refresh export registration, validation, and scheduling:
  <https://github.com/vitejs/vite-plugin-react/blob/8ae5449be23079dd17fdefc64064a3d94be6fc39/packages/common/refresh-runtime.js#L569-L648>
- Vite dynamic-import behavior:
  <https://github.com/vitejs/vite/blob/b59a73f76f5557492d83d097bb33b3dd02f27d51/docs/guide/features.md#dynamic-import>
- Rolldown's current output formats:
  <https://github.com/rolldown/rolldown/blob/111132357228f06c208af96f6f1f3c164104bdf3/packages/rolldown/src/options/output-options.ts#L53-L55>
- `weapp-tailwindcss` generator contract:
  <https://github.com/sonofmagic/weapp-tailwindcss/blob/c2262d743ad4fab4779576a7f54296eeb3e03338/packages/weapp-tailwindcss/src/generator/types.ts#L22-L55>
- `weapp-tailwindcss` Mini Program CSS finalization:
  <https://github.com/sonofmagic/weapp-tailwindcss/blob/c2262d743ad4fab4779576a7f54296eeb3e03338/packages/postcss/src/compat/mini-program-css/finalize.ts#L32-L83>

## Summary

The architecture has five owners:

1. **Native facades** synchronously register App and Pages and journal lifecycle events.
2. **SystemJS** owns application module loading, cycles, stable identities, deletion, and live-binding reconnection.
3. **React/Taro integration** owns one retained App root, Page sessions, events, and lifecycle dispatch.
4. **Vite/Rolldown plus the System postprocessor** own source semantics and production optimization.
5. **The development transaction runtime** validates fresh modules, reconnects ESM importers, then performs React Refresh.

Tailwind, Taro, and React build integration are plugin-owned. React itself remains application-owned. Package boundaries never restrict
source imports, production CSS is one `app.wxss`, and HMR uses stable IDs so SystemJS live bindings and React Refresh family identities
remain coherent across updates.
