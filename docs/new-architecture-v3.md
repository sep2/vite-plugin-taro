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
- a plugin-bundled Taro API, component, React renderer, DOM, event, and WeChat template stack;
- plugin-owned Tailwind CSS and WeChat Tailwind adaptation;
- synchronous native `App()` and `Page()` registration;
- the complete native callback surface registered by bundled Taro, including share, favorite, and exit-state callbacks;
- one App-owned React root;
- SystemJS as the only application module loader;
- static imports and every dynamic-import form supported by Vite;
- imports across every generated package boundary;
- every import cycle valid under ESM evaluation semantics;
- automatic code-only subpackages for lazy JavaScript;
- JavaScript HMR and React Refresh in WeChat DevTools;
- stable development module IDs with Vite-compatible acceptance-boundary HMR;
- one foundational SystemJS bootstrap barrier before any App, Page, or user module executes;
- a deterministic ES2018 JavaScript target lowered by the Vite 8 Rolldown/Oxc toolchain;
- Vite 8's Rolldown dependency optimizer for development dependencies and CommonJS interoperability.

The initial implementation does not support:

- independent subpackages;
- user-authored native `Component()` entry modules or dedicated integration for application-supplied or third-party native custom
  components;
- WeChat Worker entry points;
- WeChat Mini Program plugins;
- remote JavaScript evaluation;
- compatibility with user-installed `@tarojs/*` packages;
- user-controlled chunk or native subpackage placement.

Except where this document defines a hard invariant, an unsupported platform feature is simply outside the
plugin's initial integration surface. The plugin adds no feature-specific detection, rejection, or compatibility
layer for native custom components, Workers, or Mini Program plugins. Ordinary Vite, Taro, or WeChat behavior that
happens to pass through is not a support contract.

## Design principles

1. Native package boundaries are delivery boundaries, never source-level module boundaries.
2. Native registration is synchronous; application activation is asynchronous.
3. Vite owns application module IDs and the build graph; SystemJS uses those IDs unchanged and owns runtime linking, execution, live
   bindings, and cycles.
4. Every native code-loading path is generated as an AST string literal.
5. Application modules never call native `require()`.
6. The plugin owns framework and style integration so applications install no Taro or Tailwind packages.
7. Development HMR follows Vite's acceptance-boundary model while retaining Vite's stable module IDs.
8. Fresh namespaces are delivered to qualified HMR accept callbacks; existing ESM importers are not automatically reconnected.
9. Circular or otherwise unsafe updates stop plugin HMR and request a DevTools-owned hard refresh rather than
   attempting to repair or approximate replacement inside the retained heap.
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

React ownership is a closed architectural decision: the application installs and owns `react` as a direct dependency. The plugin never
bundles, vendors, aliases to a private copy, or provides a fallback React implementation. Its supported baseline is React 19 or newer,
without pinning an exact application release. React and its subpaths otherwise use normal Vite resolution; the plugin adds no React
identity, deduplication, or duplicate-instance validation. The application does not need to install Taro's renderer or
`react-reconciler`.

The plugin owns and ships:

- the React Vite transform and React Refresh integration;
- SystemJS;
- the complete Taro implementation used by the target, including its API, components, React reconciler, runtime DOM, hydration,
  event bridge, shared template ABI, helper, and WeChat platform template builder;
- Tailwind CSS;
- the `weapp-tailwindcss` transformation pipeline.

All Taro packages are bundled implementation dependencies of `vite-plugin-taro`, not application peer dependencies. Build-side Taro
code is bundled into the plugin distribution, and runtime-side Taro code is emitted into the application's SystemJS graph. The
application resolver never consults a user-installed `@tarojs/*` package, so applications do not install Taro, Tailwind, SystemJS, or
React Refresh packages themselves.

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

### Vite development HMR API

Development modules receive the standard Vite `import.meta.hot` API. It is available to application code and third-party Vite plugin
transforms, not only to the plugin's React Refresh wrapper.

The runtime supports Vite-compatible self acceptance, dependency acceptance, accepted exports, `dispose`, `prune`, `invalidate`, persistent
`data`, and custom `on`, `off`, and `send` events. Accepted dependency strings are resolved by Vite, and SystemJS uses the resulting
stable Vite module IDs unchanged.

Custom HMR events use the development control protocol as metadata; they never carry executable JavaScript. In production,
`import.meta.hot` is absent and guarded HMR branches are tree-shaken normally.

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

There are no user-facing `defineApp()`, `definePage()`, package declarations, lifecycle declarations, native
bootstrap calls, or manual chunk declarations. The plugin adds no separate native-instance extension API. Each
native facade exposes exactly the fields and callback names that the bundled Taro integration resolves for that App
or Page entry; the plugin defines no additional callback surface or callback-specific semantics.

### Vite configuration

Application entries and all native App/Page JSON configuration live in `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import { vitePluginTaro } from 'vite-plugin-taro';

export default defineConfig({
    plugins: [
        vitePluginTaro({
            project: {
                appid: 'wx0000000000000000',
                projectname: 'example'
            },
            sitemap: {
                rules: []
            },
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

`project`, optional `projectPrivate`, and `sitemap` are the sole inputs for `project.config.json`,
`project.private.config.json`, and `sitemap.json`. The plugin does not discover source JSON files or merge generated configuration with
user-owned project files. All native project, App, and Page configuration comes from `vite.config.ts`.

Changes to native project, App, or Page configuration trigger a complete native rebuild.

### Vite assets

The target retains Vite's normal asset model. JavaScript and CSS imports use Vite's asset graph, while native configuration can refer to
files copied from Vite's `publicDir`. The plugin adds no parallel static-asset API, reserved-path layer, or collision checker. Public files
follow Vite's normal copy behavior and remain in the main package initially.

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

The preferred development mode also regenerates one `app.wxss`. A CSS-only change must not enter a JavaScript HMR delivery or request a
hard refresh.

When a TSX edit changes both executable code and Tailwind candidates, the update order is:

```text
compile and write WXSS
    → publish JavaScript update.js delivery
    → evaluate and accept fresh HMR boundaries
    → perform React Refresh
```

If WeChat DevTools does not reliably retain application state while replacing global `app.wxss`, development falls back to duplicating
the complete generated stylesheet into every page's `page.wxss`. This fallback changes only development transport; production remains a
single `app.wxss`.

## Taro rendering and native companion assets

### One bundled Taro rendering ABI

The target uses Taro's runtime host-tree model. It does not compile JSX structure into page-specific WXML. React renders through the
bundled Taro React reconciler, which mutates the bundled Taro DOM. Taro hydration converts that DOM into the compact node records consumed
by Taro's WeChat templates, and the root element publishes those records through native `setData()` calls.

```text
React Fiber
    → bundled Taro React reconciler
    → bundled Taro DOM nodes
    → Taro hydration and component aliases
    → Page.setData({ root... })
    → generated Taro WeChat host templates
```

The template generator, `Shortcuts` and component aliases, hydrated node schema, root update paths, and `eh` event bridge are one internal
ABI. They always come from the same bundled Taro implementation. The plugin does not combine Taro's template output with a separately
reimplemented renderer.

This runtime model is a hard requirement for arbitrary React composition, context across the App-owned tree, `React.lazy`, Suspense, and
React Refresh. Generated page WXML is only a host-tree interpreter; application component structure remains in React and SystemJS.

### Taro WeChat template builder

The companion-asset stage constructs the template builder directly from Taro's WeChat platform implementation:

```ts
import { recursiveMerge } from '@tarojs/helper';
import { Weapp as WxPlatform } from '@tarojs/plugin-platform-weapp';

function createWxTemplateBuilder() {
    const platform = new WxPlatform(
        { helper: { recursiveMerge }, modifyWebpackChain() {}, registerPlatform() {} },
        {},
        {}
    );
    platform.modifyTemplate({});
    return platform.template;
}
```

These imports are private build-time implementation details bundled into the plugin. They are not resolved from the application.

For each complete WX bundle, the companion-asset stage emits:

- `app.json` from the normalized App configuration;
- one transformed `app.wxss` containing all collected bundle CSS;
- `base.wxml` from `templateBuilder.buildTemplate(componentConfig)`;
- `utils.wxs` from `templateBuilder.buildXScript()`;
- `comp.wxml` from `templateBuilder.buildBaseComponentTemplate('.wxml')`;
- `comp.json` with `component: true`, `styleIsolation: 'apply-shared'`, and a recursive self-reference to `comp`;
- `project.config.json`, optional `project.private.config.json`, and `sitemap.json` from the corresponding Vite configuration values;
- one page WXML built with `templateBuilder.buildPageTemplate()` and a relative import of root `base.wxml`;
- one page JSON that installs the root `comp` component alongside the page's native configuration;
- one empty page WXSS, except when the documented development CSS fallback is active.

The component configuration always includes Taro's optimized core host variants:

```text
view, catch-view, static-view, pure-view, click-view, scroll-view,
image, static-image, text, static-text
```

It then adds the dashed names of the Taro component module's `renderedExports`. Production obtains those exports from Rolldown's final
bundle metadata. Development derives the equivalent set from the complete `wx` environment graph materialized at startup. Therefore the
generated template contains every Taro host component reachable through either a static or Vite-discoverable dynamic import, without
blindly emitting the entire component surface.

If an HMR graph edit introduces a host component that is absent from the live `base.wxml`, the change crosses a native-template boundary
and triggers a hard refresh with regenerated native files. JavaScript HMR never pretends that an unavailable native template became
usable dynamically.

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
                               │ delegate configuration
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
- stable HMR identity.

### Foundational startup barrier

The native bootstrap creates the SystemJS instance and immediately starts exactly one foundational import. The facade generator writes
the exact Vite-provided foundation entry ID into the bootstrap:

```ts
const foundationReady = System.import('<Vite foundation entry ID>');
```

This promise is shared by the App facade and every Page facade. App and Page delegate imports are chained after it; they are never started
in parallel with foundational initialization. Native `App()` and `Page()` registration remains synchronous because registration stores
and journals callbacks without awaiting the promise.

The generated foundation module has an ordered side-effect dependency list:

```ts
import 'virtual:taro/internal/runtime';
import 'virtual:taro/internal/weapp-runtime';
import 'virtual:taro/internal/framework-react-runtime';
import 'virtual:taro/internal/api-initialization';
import 'virtual:taro/internal/hmr-foundation'; // empty in production

export const initialized = true;
```

The ordering is semantic, not cosmetic:

1. Taro shared state and runtime exist.
2. The WeChat platform runtime merges its host config and component definitions.
3. The React framework runtime installs lifecycle, reconciler, batching, and event hooks.
4. Taro API initialization observes those installed hooks and binds the WeChat APIs.
5. Development-only HMR and React Refresh foundations become available.

In development, the final HMR foundation stage also performs the startup session handshake. The shared `foundationReady` barrier does not
resolve until the server accepts the new runtime's session ID and build ID. If the physical materialization is stale, the server requests
a hard refresh and the barrier remains pending, so no App, Page, or user module executes from the stale snapshot. A fresh runtime never
catches up by replaying HMR deliveries.

The foundation and its complete static closure are eager, main-package-owned, and instantiated through SystemJS like all application
runtime code. They never use native `require()` directly. The module is an explicit production Rolldown entry and an explicit WX
development dependency-discovery entry, preventing tree shaking or accidental placement behind a dynamic boundary.

A foundation failure rejects App delegation and every waiting Page session. It is reported once as a foundational startup error and is
not recovered by plugin HMR. The foundation and all setup modules are immutable for HMR; a subsequent successful edit is activated through
a hard refresh.

### Vite-owned module IDs

Logical module identity is independent from its physical native capsule path, but the plugin does not define a second ID format or
identity namespace.

In development, SystemJS uses the stable module IDs exposed by the dedicated Vite `wx` environment and its `ModuleGraph` unchanged. The
same IDs flow through transforms, the plugin-owned `HotChannel`, HMR contexts, update deliveries, and the SystemJS registry. Vite remains
responsible for alias resolution, virtual-module identity, semantic resource queries, and optimized dependency IDs. The plugin does not
prefix, encode, hash, alias, or otherwise serialize them into another ID format.

In production, SystemJS uses the final output chunk IDs and filenames exposed by the Vite/Rolldown output graph unchanged. One such ID
identifies one final Rolldown chunk; source modules combined into that chunk have no separate production identity.

Native facade generation runs after Vite has identified the foundation, App, and Page entries and embeds those actual IDs. The package
planner maps the same unchanged IDs to physical capsule locations. Entry roles and native package paths never become alternate SystemJS
IDs.

The React transform uses the stable Vite source ID when registering component families. Re-executing a module therefore registers fresh
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

`resolve()` is synchronous and follows the already-resolved Vite development graph or Vite/Rolldown output graph; it does not create a
second source resolver or translate IDs into a plugin-owned namespace. `instantiate()` can use:

- an initial native capsule;
- an asynchronously loaded generated package capsule;
- a transient registration from the current `update.js` delivery;
- an acknowledged on-demand development response.

SystemJS's registry is the application module-instance store. Development delivery records are transient inputs to instantiation, not a
second persistent module registry.

### Native registration capsules

The ESM postprocessor produces a System registration and wraps it as an inert native CommonJS value:

```js
module.exports = [
    ['chunks/dependency.js'],
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
        case 'entries/app.js':
            return Promise.resolve(require('./capsules/app.js'));

        case 'chunks/editor.js':
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

Every source import is valid regardless of generated package ownership. A System registration contains only dependency IDs from the
Vite development graph or Vite/Rolldown output graph. When a dependency belongs to another generated package, `instantiate()`
asynchronously obtains its registration through the literal native transport.

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

All configured native pages are emitted in the main package. This is a hard invariant: the planner never places a native Page shell,
its WXML, JSON, or facade in a subpackage, and users do not assign pages to native packages.

Page-level laziness is expressed only through normal application code, for example with `React.lazy(() => import('./body'))` or a direct
Vite-supported dynamic import. The statically imported Page entry remains eager and main-package-owned, while the dynamic-only closure is
eligible for an automatically generated code-only subpackage. The plugin never infers an asynchronous boundary merely because a module
belongs to a particular route.

### Eager JavaScript

The planner begins with the foundational runtime entry, the generated App delegate entry, and every generated Page delegate entry. It
traverses static import edges and places the complete eager closure in the main package.

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
Modules reachable only through dynamic boundaries are eligible for generated code-only subpackages, but eligibility is not a placement
requirement. The planner may retain any or all dynamic-only modules in the main package.

### Code-only subpackages

Generated lazy packages use deterministic names and contain JavaScript capsules without native pages:

```json
{
    "root": "__dynamic__/p_a1b2",
    "name": "dynamic-p_a1b2",
    "pages": []
}
```

Code-only packages with empty page lists are a validated platform capability and part of the required WX baseline. An
executable DevTools regression probe continuously verifies that capability.

### Placement goals

Correctness does not depend on a particular lazy-package grouping because all cross-package edges are supported. A dynamic import is an
execution boundary only: it promises neither deferred physical delivery nor a dedicated native download unit. The planner freely chooses
whether eligible code remains in the main package or enters one of the generated packages.

The planner minimizes generated package count first. It may coalesce unrelated dynamic roots into one code-only subpackage and splits them
only when native package-size limits require it. Within the minimum feasible package count, it optimizes for:

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
- generated WXML, Vite public assets, and referenced assets remain in the main package initially.

## Build pipeline

### Dedicated `wx` Vite environment

The plugin registers one first-class Vite environment named `wx` for the WeChat application. It is the sole owner of the application
module graph in development and the sole application environment built in production.

The exact resolution-condition list is normalized by the plugin, but `consumer: 'client'` is intentional: WX consumes client-side assets,
CSS, and browser-oriented package exports even though it is not a browser runtime.

In development, `createWxDevEnvironment()` creates a `DevEnvironment` with its own module graph and a plugin-owned `HotChannel`. The hot
channel adapts Vite's environment-neutral HMR messages to the update compiler and the metadata/acknowledgement protocol. Executable code
still travels only through generated native files and `update.js`.

The WX environment is not a `RunnableDevEnvironment` and does not use Vite's `ModuleRunner` or its `AsyncFunction` evaluator. SystemJS in
WeChat is the only application evaluator. The environment exists on the Vite side to resolve, transform, cache, and analyze modules and
to calculate HMR propagation.

In production, the `wx` build environment owns the Rolldown build and the subsequent System-register, package-planning, native-asset, and
literal-transport stages. The plugin opts into Vite's app builder and builds only `builder.environments.wx`; the default browser `client`
and Node `ssr` environments are not application build graphs.

Third-party Vite plugins participate normally in the `wx` environment. Their hooks observe `this.environment.name === 'wx'`, and every
per-environment transform result and import edge belongs to the isolated WX graph. Browser `/@vite/client`, module-preload bootstrap, and
browser WebSocket execution are never injected into generated Mini Program code.

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

The architecture does not introduce a second source resolver or dynamic-import analyzer. Development consumes the dynamic edges Vite
materializes in the `wx` environment graph, and production consumes the chunks and edges Vite/Rolldown emits. Dynamic-import forms that
Vite can materialize therefore work automatically; an import left unresolved after the Vite pipeline cannot enter the closed WX graph.

### ES2018 JavaScript target

Every executable JavaScript artifact targets ES2018. The dedicated `wx` environment configures the Vite 8 Rolldown/Oxc toolchain
consistently across all compilation paths:

```ts
{
    oxc: {
        target: 'es2018'
    },
    build: {
        target: 'es2018'
    },
    optimizeDeps: {
        rolldownOptions: {
            transform: {
                target: 'es2018'
            }
        }
    }
}
```

`oxc.target` lowers development source modules, `build.target` lowers production Rolldown chunks, and the optimizer transform target
lowers development dependency chunks. The System-register postprocessor runs after syntax lowering and performs only the module-format
conversion; it does not establish a second language target.

The same target applies to generated SystemJS runtime code, native bootstrap and facade files, `update.js`, React Refresh wrappers, and
plugin-owned Taro runtime modules. Generated native files are either emitted through the same lowering stage or restricted and validated
to ES2018 syntax.

The generated WeChat project configuration disables DevTools' JavaScript-to-ES5 compilation. Development, preview, and production
therefore execute plugin-generated ES2018 semantics rather than relying on a user or DevTools transpilation setting. The plugin does not
inject general language polyfills; ES2018 runtime capabilities are part of the target baseline. `tsconfig.json`'s `target` does not
override this architecture target.

### Production JavaScript

Production uses the dedicated `wx` build environment's Rolldown application graph:

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

Production granularity is a closed architectural decision: one System registration corresponds to one final Rolldown output chunk, not
to one source or Vite module. Production never enables preserve-module output merely to expose more identities to SystemJS.

Rolldown owns source-module resolution, tree shaking, scope hoisting, and execution semantics inside each chunk. SystemJS owns the final
chunk graph: inter-chunk static dependencies, dynamic imports, live chunk exports, and cycles crossing chunk boundaries. Source modules
combined into one chunk intentionally have no independent production runtime identity.

### No runtime externals

Runtime JavaScript externalization is forbidden. Every user, Taro, React, and third-party JavaScript dependency must resolve into the WX
Vite graph and a Rolldown output chunk. Application-owned dependencies such as React are bundled from the application's installation; they
are not runtime externals.

A Vite plugin result or `rolldownOptions.external` rule that leaves a runtime import external fails the build. The final output validator
requires every System registration dependency ID to resolve to another emitted registration or a plugin-owned internal host module with a
concrete implementation. There is no user-facing `System.set()`, global-name mapping, CDN module, native npm external, or passthrough
native `require()` escape hatch.

Node built-ins are unsupported unless an ordinary Vite plugin rewrites them to a bundled implementation before final linking. Network
requests may still load data and assets through WeChat APIs; they never load executable JavaScript modules.

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

The initial implementation uses Babel's SystemJS module transform, followed by a small AST pass that:

- extracts the registration rather than executing global `System.register()`;
- preserves Vite development IDs and resolves production chunk references to the IDs already supplied by the Vite/Rolldown output graph;
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

This preserves Vite module graph granularity, stable source IDs, HMR boundaries, and React Refresh family identifiers. A Vite module may
be either one transformed source module or one output of Vite's dependency optimizer; development does not attempt to recover source-level
identities from inside an optimized dependency chunk.

### Development dependency optimization

The dedicated `wx` environment enables Vite 8's Rolldown dependency optimizer. The plugin supplies the foundational runtime, the App,
every Page, and required internal virtual entries to WX dependency discovery. Bare npm dependencies and CommonJS packages are prebundled through Vite's normal
optimizer before their output is converted into System registrations.

Optimized output uses the stable module IDs supplied by Vite for the current materialized development build; the plugin does not derive a
second identity from optimizer cache paths. Optimized dependencies are foundational HMR modules: they are reused by application updates
and are never replaced inside the retained runtime heap. An optimizer rerun, dependency installation, lockfile change, optimizer
configuration change, or changed optimized output creates a new development build ID, rematerializes the native project, and triggers a
hard refresh.

Linked workspace source that Vite does not optimize remains ordinary WX development modules and participates in normal HMR. Production
does not consume the development optimizer; the production `wx` environment uses the normal Rolldown application build described above.
Dependency optimization never creates a runtime external.

The normal Vite dev server remains the source transformation server. The plugin uses
`server.environments.wx.transformRequest()`, `server.environments.wx.moduleGraph`, and the WX environment's normal hot-update hooks. It
does not run a second JavaScript bundler for development and never uses the browser client's module graph as a fallback.

### Development startup materialization

At server startup the plugin creates a physical Mini Program project:

1. Resolve the foundational runtime and configured App and Page entries through the `wx` Vite environment.
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

### Native invocation relay

The synchronous native shell must expose App and Page methods before their SystemJS delegates exist. Both facades bridge
that gap with one shared `NativeInvocationRelay`; there are no separate App and Page invocation-journal implementations.

```ts
interface NativeInvocation {
    method: string;
    receiver: object;
    args: readonly unknown[];
}

type NativeInvocationRelayState = 'loading' | 'replaying' | 'active' | 'cancelled' | 'failed';

interface NativeInvocationRelay<Delegate extends object> {
    readonly state: NativeInvocationRelayState;
    readonly delegate: Promise<Delegate>;
    readonly invocationJournal: readonly NativeInvocation[];
    readonly initialReplayReady: Promise<void>;
    invoke(invocation: NativeInvocation): unknown;
    cancel(): void;
}
```

The callback names and their conditional presence come from the bundled Taro lifecycle and per-entry transform metadata.
The facade generator neither adds nor removes callback names. A change to that resolved native surface crosses a native
registration boundary and requests a DevTools hard refresh.

While the delegate is loading or the initial journal is replaying, `invoke()` appends each native invocation in
arrival order and returns `undefined`. Once the delegate resolves, the relay drains that journal as one FIFO
sequence; invocations arriving during the drain join its tail. Replay ignores return values because the original
native calls have already returned. `initialReplayReady` resolves only after the relay becomes active.

In the active state, every callback uses the same guarded forwarding path and returns exactly what Taro returns:

```ts
function invoke(invocation: NativeInvocation): unknown {
    if (!activeDelegate) {
        invocationJournal.push(invocation);
        return undefined;
    }

    const methods = activeDelegate as Record<string, unknown>;
    const method = methods[invocation.method];

    if (typeof method !== 'function') {
        return undefined;
    }

    return method.apply(invocation.receiver, invocation.args);
}
```

This follows Taro's use of `Function.prototype.apply()` and does not depend on `Reflect.apply()`. A Page that
unloads before activation cancels its relay and discards its journal. Delegate failure moves the relay to `failed`,
clears the journal, and follows the documented activation-failure path.

The relay is transport coordination, not framework lifecycle dispatch. It never maps lifecycle names, dispatches Taro
hooks, mounts or unmounts React children, mutates `Current`, routing, or DOM state, synthesizes framework events, or
interprets callback return values. The exact objects returned by Taro's `createReactApp()` and
`createPageConfig()` remain the sole owners of those semantics.

### App facade

Generated `app.js` is intentionally small and synchronous:

```js
const runtime = require('./__taro__/bootstrap.js');

App(runtime.createAppFacadeConfig({
    moduleId: '<Vite App delegate module ID>'
}));
```

The placeholder denotes the exact development module ID or production output chunk ID written by facade generation after Vite finalizes
the relevant graph. `createAppFacadeConfig()` reuses the bootstrap's `foundationReady` promise, chains the App delegate `System.import()` after it, and returns
the native App configuration before yielding control.

The plugin-generated App delegate module imports the user's App component, React, the bundled Taro React renderer, and Taro framework
support through SystemJS. It exports the exact object returned by bundled Taro `createReactApp()`:

```ts
import React from 'react';
import ReactRenderer from 'virtual:taro/internal/react-renderer';
import { createReactApp } from 'virtual:taro/internal/framework-react';
import AppComponent from 'virtual:taro/user-app';
import appConfig from 'virtual:taro/app-config';

export default createReactApp(AppComponent, React, ReactRenderer, appConfig);
```

Conceptually, its contract is:

```ts
interface AppFacadeDelegateModule {
    default: ReturnType<typeof createReactApp>;
}
```

The internal virtual-module names are not user-facing API. `createAppFacadeConfig()` validates the default export and
retains that exact object as the App delegate. The App facade submits supported native calls to the shared
`NativeInvocationRelay`; it does not translate the delegate into a second framework controller.

Taro's delegate remains the object stored in its own `Current.app`; its private `mount`, `unmount`, renderer,
hook, and routing behavior are not copied or reimplemented by the facade. Data that WeChat requires while
registering `App()` remains in the synchronous facade. Runtime data that Taro attaches during delegated lifecycle
execution behaves exactly as it does when the Taro object is passed directly to `App()`.

### One App-owned React root

Executing the App delegate module calls bundled Taro `createReactApp()`. Taro creates one React root and retains it for the lifetime of
the native App. There is no plugin-defined `AppController` between the facade and Taro.

The user's App component is the root component. Taro's normal `Current.app.mount()` and `Current.app.unmount()` paths add and remove Page
children in that retained tree.

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
        moduleId: '<Vite Page delegate module ID>',
        initialData: { root: { cn: [] } }
    }));
});
```

The generated Page delegate module exports the exact object returned by bundled Taro `createPageConfig()`:

```ts
import { createPageConfig } from 'virtual:taro/internal/runtime';
import PageComponent from 'virtual:taro/user-page';
import pageConfig from 'virtual:taro/page-config';

export default createPageConfig(
    PageComponent,
    'pages/home/index',
    { root: { cn: [] } },
    pageConfig
);
```

`createPageFacadeConfig()` schedules this module import during page-entry evaluation, strictly after the shared
`foundationReady` promise. Its synchronous native result contains the build-known initial data, every callback wrapper
resolved by the bundled Taro integration for that entry, and the stable `eh` wrapper. Each wrapper submits its
native invocation to the Page session's shared `NativeInvocationRelay`. The relay forwards it to the same-named
function on the exact Taro Page configuration with the native Page instance as `this`. Taro remains solely
responsible for mounting, `Current.page` and router state, lifecycle hooks, DOM updates, and event dispatch.

`update.js` is present only for development execution delivery. Every page has a direct literal dependency on it so WeChat DevTools can
rerun page-side code when a delivery is published.

`registerPageFacade()` makes page entry re-execution idempotent. Re-executing a page entry during HMR cannot:

- call native `Page()` twice for the live route;
- recreate the Taro App delegate;
- recreate the React root;
- recreate the route's Taro Page delegate;
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
    relay: NativeInvocationRelay<ReturnType<typeof createPageConfig>>;
}
```

The delegate-module import begins during page-entry evaluation. `onLoad` binds the native instance and creates the
session and its relay. Page activation waits for the App relay's `initialReplayReady` barrier and the route's Taro
Page delegate.

Lifecycle callbacks and native template events that arrive before activation become `NativeInvocation` records in the
relay's journal. The relay forwards each record to the matching Taro configuration method exactly once; it never
independently dispatches a Taro hook.

If `onUnload` arrives before activation, the session and its relay are cancelled. The module can finish loading
and remain cached, but the cancelled relay discards its journal and never invokes Taro `onLoad`, mounts, or retains
the native Page instance.

### Delegate and activation failures

Build, transform, and registration-generation errors are rejected before materialization and never overwrite the last runnable Mini
Program. A successfully emitted capsule can still fail at runtime because native asynchronous loading fails, module execution or top-level
await rejects, or a generated delegate module or Taro configuration creator throws.

The native `App()` or `Page()` registration has already completed when such a rejection occurs. The facade therefore:

1. marks the App delegate or Page session as `failed`;
2. clears the invocation journal and prevents a later Taro mount;
3. rejects dependent Page delegation when the App delegate failed;
4. logs one enriched error with the module chain, activation phase, and source-mapped location;
5. rethrows the enriched error asynchronously so WeChat DevTools receives it through its normal error handling.

The plugin does not render a custom runtime error overlay or retry native registration inside the failed runtime. After a subsequent
successful compilation, the server rematerializes the project and activates it through a hard refresh.

## Lifecycle and event behavior

Lifecycle semantics follow the Taro programming model, not a previous bootstrap implementation.

The App facade synchronously exposes the standard App lifecycle surface and submits each call to its
`NativeInvocationRelay`. Once `createReactApp()` returns the exact Taro App delegate, the relay forwards its
initial journal in FIFO order. Page activation waits for the App relay's `initialReplayReady` barrier.

Core Page lifecycle order is preserved:

```text
onLoad → onShow → onReady → onHide/onShow cycles → onUnload
```

Additional Page callbacks, including pull-down refresh, reach-bottom, page scroll, resize, and tab-item callbacks,
use the same FIFO invocation relay. The generated `eh` method is the stable native template event bridge into the
Taro event system.

### Complete Taro callback surface

The facade exposes every callback that the bundled Taro integration resolves for the entry, including
`onShareAppMessage`, `onShareTimeline`, `onAddToFavorites`, and `onSaveExitState`. Conditional callback presence follows
Taro's own source-transform and page configuration behavior; the plugin does not independently infer, add, remove, or
reinterpret callbacks.

Before activation, a callback invocation is journaled and returns `undefined`. After activation, the relay invokes
the exact method on the Taro configuration object and returns its value unchanged, including a returned object or
`Promise`. Adding or removing a conditionally registered callback regenerates the native facade and requests a
DevTools hard refresh.

## Development HMR architecture

### Stable module identities

Development HMR uses the stable module ID supplied by Vite for each module in the dedicated `wx` environment. For an ordinary source
module, that ID may be the same URL Vite exposes in its development graph:

```text
/src/components/card.tsx
```

The plugin never creates timestamped, content-hashed, prefixed, or generation-specific module IDs. Vite remains the sole authority for
module identity; delivery versions identify executable `update.js` payloads, never logical modules.

Stable IDs provide two important properties:

1. Every delivery, source stamp, HMR context, and fresh registration addresses the same logical module.
2. React Refresh registers fresh component types under the same module-derived family identifiers.

Stable identity does not mean that an evaluated namespace object is mutated in place. HMR follows Vite's acceptance-boundary semantics:
the runtime evaluates a fresh accepted module under its stable ID and passes its namespace to the old qualified accept callback. Importers
outside the invalidated region retain their existing bindings unless the accept callback or framework updates application state.

### Vite propagation and boundaries

The Vite development module graph decides whether an edit is hot-applicable before `update.js` is published:

1. Start at every changed module that has executed in the active runtime.
2. Walk its importers until finding self-accepting modules, accepted dependencies, or accepted exports.
3. Publish one update for each qualified boundary.
4. Stop plugin HMR propagation if it reaches a dead end or an HMR boundary lies inside a circular import chain, then request a hard
   refresh before mutating the SystemJS registry.

A runtime update carries the same essential relationship as Vite's web payload:

```ts
interface HotUpdate {
    boundaryId: string;
    acceptedId: string;
    reloadModuleIds: string[];
}
```

`boundaryId` owns the old accept callback. `acceptedId` is freshly imported and passed to that callback. `reloadModuleIds` is the loaded,
invalidated SystemJS region that must be removed so importing `acceptedId` observes current registrations. Several updates in one delivery
can share registrations and reload IDs.

### Replaceable and foundational modules

Application modules are eligible for hot replacement when Vite propagation reaches a qualified boundary, including:

- the user's App component;
- Page components;
- shared React components;
- application stores and utilities reached by an accepted boundary;
- application-owned virtual modules;
- newly introduced modules and import edges.

The following foundations are never hot-replaced:

- the generated foundational entry and all of its setup modules;
- React;
- `react-reconciler`;
- the React Refresh runtime;
- SystemJS;
- the Taro WeChat platform runtime, API initialization, and renderer;
- the native facade and bootstrap runtime.

An update that reaches a foundational module is not published through plugin HMR; the server rematerializes the project and performs a
hard refresh.

### SystemJS deletion contract

The runtime wraps the pinned SystemJS deletion API but deliberately does not use its importer-reconnection extension:

```ts
interface HotSystem {
    deleteForViteHmr(id: string): boolean;
    import(id: string): Promise<ModuleNamespace>;
}

function deleteForViteHmr(id: string): boolean {
    const reconnect = System.delete(id);

    // Vite-compatible HMR intentionally leaves existing importers unchanged.
    // Do not call or retain SystemJS's reconnect closure.
    // FUTURE: an explicitly owner-aware SystemJS graph could stage a complete
    // SCC, validate it, and reconnect only external importer edges atomically.
    return reconnect !== false;
}
```

Importing a successfully deleted stable ID creates and evaluates a fresh load record. The fresh namespace is delivered to qualified HMR
accept callbacks; it is not pushed automatically through old ESM setters.

Before importing any accepted module, the runtime deletes the union of its loaded `reloadModuleIds`. A replacement is unsafe if deletion
fails because a module is still executing, participates in unresolved top-level await, or is in another unsupported loader state. The
runtime reports the failure without acknowledging the delivery, and the server requests a DevTools hard refresh.

### React Refresh ordering

The React transform has two separate responsibilities:

1. Fresh module execution registers component types with the React Refresh runtime.
2. The old module's HMR accept callback validates whether the fresh export shape is a safe Refresh boundary.

The update order mirrors Vite web HMR:

```text
capture old qualified accept callbacks
    → run dispose handlers for accepted modules
    → System.delete(invalidated stable IDs)
    → install fresh registrations
    → System.import(accepted stable IDs)
    → fresh component types register
    → invoke old accept callbacks with fresh namespaces
    → propagate hot.invalidate() when a boundary is incompatible
    → perform queued React Refresh for valid boundaries
    → acknowledge delivery
```

An incompatible React boundary calls `hot.invalidate()`. The server then propagates from that boundary to a higher accepting importer; if
none exists, it requests a DevTools hard refresh. Existing importers are not automatically exposed to the fresh exports
while this decision is made.

React Refresh remains the sole owner of component-family replacement, Fiber updates, and state preservation. The plugin owns its wrapper
and scheduler, so `performReactRefresh()` is released only after every callback in the current delivery has completed successfully or its
invalidation has been handed back to the server.

### Hot delivery batch

One executable delivery can contain several Vite boundary updates and one shared set of registrations:

```ts
interface HotModuleRegistration {
    id: string;
    registration: SystemRegistration;
}

interface HotUpdateBatch {
    updates: HotUpdate[];
    registrations: HotModuleRegistration[];
    newModules: HotModuleRegistration[];
    prunedModuleIds: string[];
}
```

The runtime applies a batch in these phases:

#### 1. Prepare

- Verify build ID, runtime session ID, delivery version, and nonce.
- Reject foundational updates and Vite-detected circular HMR chains.
- Capture qualified callbacks and dispose handlers before fresh HMR contexts replace them.
- Ensure every registration required for the accepted imports is present or already safely loaded.
- Do not mutate the SystemJS registry yet.

A transform or dependency-preparation failure leaves the running application untouched.

#### 2. Dispose

Run Vite-compatible dispose handlers for the accepted module IDs and preserve each module's `hot.data` object under its stable source ID.

#### 3. Delete

Call `deleteForViteHmr()` for the union of loaded `reloadModuleIds` before importing any accepted module. Discard every upstream reconnect
closure immediately. New modules have no old load record and require no deletion.

#### 4. Instantiate and execute

Install fresh registrations as transient instantiation inputs, then import every unique `acceptedId` under its stable ID. SystemJS links
its fresh invalidated dependencies and reuses unaffected dependencies already in the registry.

Fresh execution creates new HMR contexts and registers fresh React component types under the same Refresh family identifiers.

#### 5. Accept or invalidate

Invoke each captured qualified callback with the corresponding fresh namespace. React boundary validation may queue Refresh work or call
`hot.invalidate()` to request propagation to a higher boundary.

A linking, execution, dispose, or callback exception after deletion marks the batch irrecoverably failed. The runtime reports the failed
phase without acknowledging the batch, and the server requests a DevTools hard refresh. The runtime never reports a
partially applied batch as healthy.

#### 6. Refresh and acknowledge

Release valid queued React Refresh work. After Refresh completes and every invalidation request has been accepted by the control server,
acknowledge the delivery version.

Executing `update.js` alone is not success. Success means all fresh accepted modules executed, callbacks completed, valid boundaries
refreshed, invalid boundaries requested further propagation, and the runtime acknowledged the applied version.

### Import graph changes

Adding or removing imports is hot-replaceable whenever Vite propagation finds a qualified boundary.

For a newly added static dependency:

1. The server includes its registration and the invalidated region needed by the accepted import.
2. The runtime deletes that loaded region and imports `acceptedId` under its stable ID.
3. SystemJS links the new dependency into the fresh region.
4. The old boundary callback receives the fresh accepted namespace.

Importers above the boundary are not automatically reconnected. The accept callback or framework owns the visible update, matching Vite's
web contract.

For a removed dependency, the fresh registration no longer declares it. Vite prune semantics run cleanup handlers once no current loaded
module uses the dependency, after which the runtime may delete its unreferenced SystemJS record.

A new dynamic dependency can be delivered immediately or fetched through the on-demand development path when first imported. Native
subpackage declarations are not rewritten during the live session. The next cold materialization replans package ownership.

### Circular updates

Ordinary module loading always uses full SystemJS cycle semantics, including cycles that cross generated native packages.

HMR deliberately follows Vite's stricter rule. If an accepting boundary is inside a circular import chain, the server stops plugin HMR
before deleting any live System module and requests a DevTools hard refresh. The initial implementation does not
attempt to reconstruct cycle execution order inside a retained application heap.

### Future: importer-aware live-binding reconnection

A stronger SystemJS-specific HMR model remains a possible future architecture, but it is intentionally not part of the initial runtime.
Such a model could replace a complete changed SCC and reconnect existing live ESM importers after validation. Doing that safely requires
more than upstream `System.delete()`:

- SystemJS currently stores importer setters as anonymous functions without importer IDs;
- a multi-module replacement must distinguish stale internal setters from stable external importer edges;
- every changed member must be staged and linked before any external namespace is exposed;
- failed validation must not leak fresh exports into retained modules;
- top-level await and module side effects need explicit transaction rules.

A future implementation would therefore need owner-aware edges such as
`{ importerId, dependencyId, setter }` and a first-class staged replacement transaction. It must be introduced as an explicit HMR semantic
change with dedicated conformance tests, not hidden behind the current Vite-compatible deletion wrapper. The `FUTURE` comment in
`deleteForViteHmr()` is the implementation marker for this work.

### Unloaded modules

An HMR update for a module that has never been evaluated does not create a dormant replacement record in the SystemJS registry.

When that stable ID is first imported later:

1. `instantiate()` compares the initial capsule's source stamp with the development server's current stamp.
2. If current, it loads the literal native capsule.
3. If stale, it requests an on-demand executable delivery through the control channel.
4. DevTools executes `update.js`.
5. The delivery resolves the pending instantiation token with the current registration.
6. SystemJS links and executes the module once under its stable ID.

There is no deletion or accept callback because no old load record or HMR boundary instance exists.

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
    sessionId: string;
    version: number;
    nonce: string;
    batch: HotUpdateBatch;
    pendingModuleResponses: PendingModuleResponse[];
}
```

Properties:

- `sessionId` binds the executable delivery to exactly one active runtime heap; a new session never consumes an old session's delivery;
- `version` is a monotonically increasing delivery sequence, not a module identity.
- `nonce` ensures DevTools observes a physical file change when a delivery must be republished.
- executing the same delivery twice is harmless;
- registrations remain only until the update batch or pending instantiation consumes them;
- an applied version is acknowledged only after callbacks, Refresh work, and invalidation publication complete.

## Development control protocol

### HTTP metadata channel

The normal Vite dev server exposes a control protocol used through `wx.request`. It transports metadata only.

The runtime reports:

- build ID;
- runtime session ID;
- last applied delivery version;
- loaded stable module IDs or source stamps;
- pending on-demand instantiation requests;
- update-batch success, invalidation, or failure.

The server retains:

- the current build ID;
- transformed registrations and update metadata;
- a monotonic delivery sequence;
- the active runtime's acknowledgement state;
- bounded delivery state for the active session only.

### One active runtime session

The protocol supports one active WeChat runtime at a time. A session ID does not represent concurrent-client support.

A new session means WeChat DevTools or the App restarted and arrived with a fresh heap. The new session replaces the old active session,
and all old HMR deliveries, acknowledgements, pending instantiations, callbacks, and `hot.data` are discarded. Deliveries are never
replayed into a new runtime.

The development foundation barrier holds App and Page activation while the server makes that decision. If the physical project is already
a current materialization, the server accepts the session and the new heap itself is the completed hard refresh. If source has advanced
through session-local HMR since that materialization, the server leaves the barrier pending, emits a new complete materialization and
build ID, and DevTools performs one full compilation and restart before development continues.

There is no fairness, fan-out, or concurrent publication protocol for multiple simulator sessions sharing one `update.js`.

### Stop-and-wait publication

Only one unacknowledged delivery range is published for the active session. Rewriting `update.js` is not an acknowledgement.

If DevTools misses or coalesces a file notification, the server republishes the same version with a new nonce. The runtime ignores an
already applied version and acknowledges it again.

### Restart behavior

#### App or DevTools restart

A fresh runtime reports a new session ID and its current build ID. The previous session is discarded and no delivery is replayed. If its
physical files are behind current source, the server creates a new complete materialization and build ID and hard-refreshes once more into
that current snapshot.

#### Vite server restart

The plugin creates a fresh physical development build and a new build ID. Deliveries from the previous build are discarded, and DevTools
hard-refreshes into the new materialization.

#### Bounded delivery state

Delivery state is bounded for the active session. Exceeding the bound performs a hard refresh and starts a new build and runtime session;
it never replays an accumulated history into another heap.

## DevTools-owned hard refresh

A hard-refresh request is the single recovery path whenever a change cannot be represented safely as state-preserving
HMR. The plugin stops HMR and publishes a complete materialization intended for DevTools reload when:

- Vite or the framework finds no acceptable HMR boundary;
- propagation encounters an accepting boundary inside a circular import chain;
- `hot.invalidate()` propagation from an incompatible boundary reaches no higher acceptable boundary;
- a foundational module changes;
- `System.delete()` cannot safely remove an invalidated module;
- fresh registration linking or execution fails after registry mutation begins;
- an accept, dispose, or Refresh step leaves the update batch unsafe;
- WXML or native JSON changes;
- App/Page routes or native configuration change;
- the initial literal transport or cold package plan must be rematerialized immediately;
- an asset change cannot be represented as a safe style-only update;
- the development server restarts;
- active-session delivery state is exhausted.

For a server-detected boundary, the registry has not been mutated. For a runtime failure after mutation, the runtime
reports the failed phase without acknowledging the delivery. These facts terminate plugin HMR for that heap but
create no ordered teardown or runtime-state protocol.

The server transactionally builds a complete current Mini Program materialization under a new build ID. A failed build
publishes nothing and leaves the last runnable generated project unchanged. A successful build publishes the complete
project, including the new build ID in watched native bootstrap code. Publication does not sequence active-session
disposal, DevTools compilation, or process restart. The server makes no state guarantee about the old heap after
requesting the refresh.

WeChat DevTools alone decides when to compile and reload the App. Once the reload occurs, the App starts with a
fresh heap and session; the normal new-session handshake supersedes all old deliveries, acknowledgements, pending
instantiations, callbacks, and `hot.data`. Hard-refresh completion is observed only when that fresh session reports
the published build ID.

CSS changes use WeChat's WXSS hot replacement whenever possible. If global replacement is unreliable, the complete stylesheet is emitted
into every page WXSS during development rather than forcing every style edit through JavaScript HMR.

Hard refresh does not use `wx.reLaunch()`, restore the route or Page stack, preserve application state, or replay
HMR data. The plugin only classifies the update as unsafe and publishes a complete replacement project. WeChat
DevTools owns the reload decision, compilation, and process restart. No DevTools CLI automation is required.

## Error handling and diagnostics

A module-load error reports:

- requested Vite module or output chunk ID;
- parent/importer ID;
- resolved physical package and capsule path;
- whether the source was an initial capsule, update-delivery registration, or on-demand response;
- build, session, and delivery IDs;
- the SystemJS dependency chain;
- the original source location through chained source maps.

An initial activation error uses the same module-load diagnostics and additionally identifies the App or Page facade, activation phase,
and affected Page session. It is logged once before being rethrown asynchronously.

An HMR error additionally reports:

- update-batch phase;
- deleted module IDs;
- fresh accepted modules that executed;
- callbacks that accepted, invalidated, or failed;
- pending invalidation propagation;
- whether and why the update requested a hard refresh.

A transform failure before publication does not overwrite the last successful `update.js` or `app.wxss`. The running application stays
on its previous applied code.

Once registry deletion begins, any unrecoverable failure terminates plugin HMR for that batch. The runtime never pretends that a partially
applied Vite HMR batch is healthy; it reports the failure so the server can request a DevTools hard refresh.

## Hard invariants

The implementation enforces these invariants with build-time assertions and runtime checks:

1. `App()` and every `Page()` execute synchronously from their native entry files.
2. Every native code-loading path is an AST string literal.
3. Application modules contain no native module-resolution calls.
4. There is exactly one SystemJS realm.
5. A logical application module uses exactly one ID supplied by Vite's development graph or Vite/Rolldown's production output graph and
   has one emitted owner package per build; the plugin creates no alternate ID namespace or alias.
6. Development HMR uses Vite's stable module ID unchanged for the lifetime of the active runtime session.
7. HMR deletes every loaded invalidated System record before importing its fresh accepted ID.
8. The runtime never calls or retains the importer-reconnection closure returned by upstream `System.delete()`.
9. Existing ESM importers outside the invalidated region are not automatically reconnected.
10. Fresh namespaces are delivered only to qualified Vite HMR accept callbacks.
11. React Refresh executes only after the current delivery's accept callbacks complete.
12. An incompatible boundary propagates with `hot.invalidate()` and hard-refreshes only when no higher boundary accepts it.
13. A Vite-detected circular HMR chain triggers a hard refresh before registry mutation.
14. Foundational modules are never hot-replaced.
15. An unsafe update batch is never approximated or acknowledged; it triggers a hard refresh.
16. A delivery is acknowledged only after callbacks, React Refresh, and invalidation publication complete.
17. Development delivery registrations are transient and do not form a second persistent module registry.
18. Modules are never duplicated across generated packages.
19. All configured native pages are emitted in the main package.
20. Only JavaScript exclusively reachable through dynamic boundaries is eligible to enter generated subpackages; the planner may retain
    any eligible module in the main package.
21. Every initially materialized Vite module or output chunk ID has exactly one literal native capsule mapping.
22. Cross-package edges never change logical module identity.
23. Page entry reruns cannot recreate the App root or duplicate native route registration.
24. A cancelled or failed pre-activation Page session can never mount later.
25. Runtime activation failures are surfaced through WeChat DevTools without a plugin-owned overlay.
26. Production emits all Tailwind and ordinary CSS into one `app.wxss`.
27. Tailwind and class rewriting are owned by the plugin's `weapp-tailwindcss` pipeline.
28. Each facade's callback names and conditional presence are exactly the native surface resolved by the bundled Taro
    integration; the plugin neither adds nor removes callbacks, and active forwarding returns Taro's result unchanged.
29. The development protocol has one active runtime session; replacing it discards all HMR delivery state and never replays updates into
    the new heap.
30. The dedicated `wx` Vite environment is the only application transform, module, and HMR graph.
31. Vite's browser client and `ModuleRunner` never evaluate WX application modules.
32. The Taro template builder, component aliases, hydration schema, root updater, event bridge, and React renderer come from one bundled
    implementation.
33. JSX structure is rendered through Taro's runtime host tree and is never compiled into page-specific structural WXML.
34. Application dependency resolution never consumes a user-installed `@tarojs/*` package.
35. App and Page facades are transport coordinators, not framework controllers. They use one shared
    `NativeInvocationRelay` abstraction to journal supported native invocations only while bridging asynchronous
    delegate activation, then forward each invocation exactly once and in arrival order to the exact objects
    returned by Taro's `createReactApp()` and `createPageConfig()`. Once active, the relay returns the exact delegate
    result. It never interprets lifecycles, callback return values, or independently dispatches Taro hooks, mounting,
    routing, DOM updates, or framework events.
36. React is always an application-installed dependency, the plugin never ships a private React implementation, and React resolution
    receives no plugin-specific identity or deduplication policy.
37. Every production System registration is a final Rolldown chunk; source modules do not retain independent production runtime
    identities.
38. Every runtime JavaScript dependency is bundled into the WX graph; external System modules, native module passthrough, and remote
    executable modules are forbidden.
39. WX development uses Vite's Rolldown dependency optimizer; optimized outputs are foundational for one materialized build, and any
    optimizer rerun creates a new build ID, complete rematerialization, and hard refresh.
40. One shared foundational SystemJS import completes Taro runtime, WeChat platform, React framework, API, and development-HMR setup in
    order before any App, Page, or user module executes.
41. Rolldown/Oxc lowers development source, optimized dependencies, production chunks, and generated runtime code to ES2018; DevTools
    JavaScript-to-ES5 compilation is disabled.
42. `vite.config.ts` is the sole source of native project, App, Page, and sitemap configuration; generated JSON files are never merged with
    source JSON files.

## Validation plan

### WX Vite environment tests

- development transforms use only `server.environments.wx`;
- the WX graph has independent resolved IDs, importers, accepted dependencies, and transform caches;
- third-party plugin hooks execute with `this.environment.name === 'wx'`;
- WX resolution selects the configured client and platform package conditions;
- browser `/@vite/client`, module-preload code, and WebSocket execution are absent;
- the custom HotChannel receives Vite propagation results and emits metadata rather than executable source;
- production builds only `builder.environments.wx`;
- development and production both resolve user source through the same environment-aware plugin pipeline;
- development source, optimized dependencies, production chunks, and generated runtime files contain no syntax above ES2018;
- the System-register pass changes module format without changing the established ES2018 target;
- generated project configuration disables DevTools JavaScript-to-ES5 compilation;
- the WX environment explicitly enables the Rolldown dependency optimizer with the generated App and Page discovery entries;
- CommonJS npm dependencies execute from optimized System registrations;
- SystemJS and HMR use the stable module IDs supplied by Vite without a plugin prefix, alias, digest, or translation layer;
- application HMR reuses foundational optimized dependencies;
- optimizer reruns, lockfile changes, and changed optimized output force rematerialization and a hard refresh;
- linked, unoptimized workspace source remains normally hot-replaceable;
- the plugin distribution contains no private React implementation or React-specific deduplication behavior;
- native project, private-project, and sitemap outputs are generated only from Vite configuration;
- Vite `publicDir` and graph assets retain Vite's normal behavior without a parallel plugin asset system.

### System loader tests

- the foundational module executes exactly once before App, Page, and user modules;
- platform host configuration exists before framework and API initialization execute;
- concurrent App and Page requests share one `foundationReady` promise;
- a new development session cannot pass `foundationReady` until the server accepts its session ID and build ID;
- a stale materialization remains behind the foundation barrier and hard-refreshes without executing App, Page, or user modules;
- a foundational rejection prevents every delegate import and reports one startup failure; a subsequent successful correction activates
  through a hard refresh;
- production emits exactly one System registration for each final Rolldown JavaScript chunk;
- production does not enable preserve-module output or expose source modules as independent System identities;
- Rolldown-internalized module cycles and SystemJS cross-chunk cycles preserve their respective ESM semantics;
- every final System dependency resolves to an emitted registration or plugin-owned implemented host module;
- user or plugin attempts to externalize runtime JavaScript fail the build;
- application-owned React is bundled from the application installation rather than externalized;
- Node built-ins fail unless transformed to bundled modules before linking;
- static imports and live bindings;
- re-exports and namespace imports;
- function hoisting through cycles;
- cycles crossing two or more generated packages;
- dynamic and nested dynamic imports;
- dynamic-import cycles;
- concurrent imports of one unloaded package;
- top-level await and error propagation;
- relative resolution through the IDs and dependency relationships supplied by Vite and Vite/Rolldown;
- one module instance across multiple importers;
- literal transport failures with complete diagnostics.

### Stable-ID HMR tests

- importing the same ID after `System.delete()` evaluates the fresh registration;
- `deleteForViteHmr()` discards and does not retain the upstream reconnect closure;
- importers outside the invalidated region keep their original bindings;
- self-accept callbacks receive the fresh self namespace;
- dependency-accept callbacks receive only the fresh accepted dependency;
- accepted-export boundaries follow Vite propagation rules;
- application and third-party modules receive the complete Vite `import.meta.hot` context;
- custom HMR events round-trip through the metadata control protocol;
- dispose runs before deletion;
- fresh execution registers React component types before the old accept callback runs;
- a valid React boundary refreshes while retaining component state;
- an invalid React boundary emits `hot.invalidate()` and propagates to its importers;
- invalidation with no higher boundary triggers a hard refresh;
- App, Page, and shared component modules retain Refresh family IDs;
- multiple boundary updates share one delivery batch without reconnecting old importers;
- an accepting boundary inside a circular import chain hard-refreshes before deletion;
- deletion failure triggers a hard refresh;
- linking, execution, dispose, or callback failure after deletion terminates the batch without acknowledging it and triggers a hard
  refresh;
- foundational changes bypass plugin HMR and trigger a hard refresh;
- `hot.data` survives stable-ID replacement;
- accept, prune, and invalidate behavior remains deterministic;
- adding and removing imports works without changing module IDs;
- unloaded updates are not retained as dormant registry definitions;
- first import of a stale capsule receives current code on demand.

### Package planner tests

- eager closure remains in the main package;
- dynamic-only modules may remain main or enter generated packages according to the planner's physical layout;
- no statically reachable module enters a generated subpackage;
- a dynamically and statically reachable module remains main;
- shared lazy modules are never duplicated;
- cross-package cycles preserve one module identity;
- deterministic package naming;
- package-count and size diagnostics;
- empty-page code-only package generation;
- every native require path remains literal.

### Facade tests

- synchronous App and Page registration while the foundational import is pending;
- neither App nor Page delegate import begins before `foundationReady` resolves;
- App and Page facades use the same `NativeInvocationRelay` implementation;
- pre-activation App invocations are journaled and replayed in FIFO order;
- invocations arriving during initial replay join the FIFO tail before `initialReplayReady` resolves;
- active relays forward invocations immediately and return the exact delegate result;
- every forwarded invocation preserves its method name, native receiver, and arguments and executes exactly once;
- every facade contains exactly the callback names that bundled Taro resolves for that entry;
- changing conditional callback presence requests a DevTools hard refresh;
- bundled Taro `createReactApp()` executes exactly once and its returned object is the exact App delegate;
- bundled Taro `createPageConfig()` executes exactly once per route and its returned object is the exact Page delegate;
- the relay never interprets a lifecycle or independently dispatches a Taro hook, mount, route update, DOM update, or
  framework event;
- Page lifecycle ordering before and after mount;
- App readiness before Page mount;
- Taro `Current.app` remains the object created by `createReactApp()`;
- one App-owned React root;
- hidden pages remain mounted;
- unload unmounts exactly once;
- unload-before-activation cancels without replay or mount;
- App delegate failure rejects waiting Page sessions and prevents their Taro mount;
- Page delegate failure enters `failed`, clears the invocation journal, and never invokes Taro `onLoad`;
- activation errors are enriched, logged once, and rethrown asynchronously without a plugin overlay;
- repeated page entry execution is idempotent;
- `onShareAppMessage`, `onShareTimeline`, `onAddToFavorites`, and `onSaveExitState` are forwarded when Taro registers
  them;
- callback objects and Promises returned by Taro are returned unchanged;
- forwarding uses guarded `Function.prototype.apply()` rather than `Reflect.apply()`.

### Taro rendering ABI tests

- the bundled WeChat template builder and bundled runtime agree on every `Shortcuts` field and component alias;
- `base.wxml`, `utils.wxs`, `comp.wxml`, and `comp.json` are deterministic;
- every page WXML imports root `base.wxml` through a correct relative path;
- every page JSON installs the recursive `comp` component without discarding native page configuration;
- production `renderedExports` select all and only reachable Taro host components plus the required optimized core variants;
- development graph analysis produces the same host-component set for the same source graph;
- Taro hydration output renders through the generated templates;
- `eh` dispatch resolves `sid` values back to the corresponding bundled Taro DOM node;
- introducing a previously absent host component during HMR forces a native template rebuild;
- no generated application module resolves a user-installed `@tarojs/*` package.

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
- acknowledgement occurs only after callbacks, Refresh, and invalidation publication;
- a fresh session replaces the previous active session and discards its deliveries, pending imports, acknowledgements, and HMR data;
- an `update.js` delivery addressed to an old session is ignored by a fresh runtime;
- App restart never replays retained updates and hard-refreshes if the materialized project is behind current source;
- server restart creates a new build ID and hard-refreshes into a complete materialization;
- pending imports survive page entry reruns within one runtime session;
- bounded active-session delivery state triggers a hard refresh;
- a successful hard-refresh materialization is published atomically with its new build ID;
- publication imposes no ordering or state transition on the current runtime;
- DevTools reload starts a fresh heap and session without restoring any previous runtime state;
- hard-refresh completion is observed only when the fresh session reports the published build ID;
- a failed hard-refresh materialization leaves the last runnable generated project unchanged and makes no runtime-state
  guarantee.

### WeChat DevTools probes

The validated code-only package capability remains covered by an executable regression probe:

- code-only subpackages with `pages: []`.

These behaviors remain executable integration probes rather than assumptions:

- literal asynchronous loading in every main/subpackage direction;
- cross-subpackage SystemJS cycles;
- direct `page.js` to `update.js` dependency preserving the App heap;
- page entry rerun and route-registration guarding;
- pending `System.import()` surviving an on-demand delivery rerun;
- `System.delete()` replacement with the reconnect closure deliberately discarded;
- App root and React Fiber identity surviving valid HMR;
- invalid Refresh boundary propagating to a higher boundary, with a hard refresh only at a dead end;
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
- SystemJS registry deletion and its deliberately unused importer-reconnection return value:
  <https://github.com/systemjs/systemjs/blob/9647576d43294e938ddae8fe231beb62255f4e46/src/features/registry.js#L64-L93>
- SystemJS's anonymous importer-setter storage, which motivates the documented future work:
  <https://github.com/systemjs/systemjs/blob/9647576d43294e938ddae8fe231beb62255f4e46/src/system-core.js#L142-L166>
- Vite's documented acceptance-boundary semantics, including that original imports are not swapped:
  <https://vite.dev/guide/api-hmr#hot-accept-cb>
- Vite's isolated environment module graphs and environment-scoped transforms:
  <https://github.com/vitejs/vite/blob/b59a73f76f5557492d83d097bb33b3dd02f27d51/docs/guide/api-environment-instances.md#L31-L140>
- Vite's runtime-provider environment factory and custom transport model:
  <https://github.com/vitejs/vite/blob/b59a73f76f5557492d83d097bb33b3dd02f27d51/docs/guide/api-environment-runtimes.md#L16-L83>
- Vite's environment-neutral HMR client:
  <https://github.com/vitejs/vite/blob/b59a73f76f5557492d83d097bb33b3dd02f27d51/packages/vite/src/shared/hmr.ts>
- Vite's server-side boundary propagation and circular-import detection:
  <https://github.com/vitejs/vite/blob/b59a73f76f5557492d83d097bb33b3dd02f27d51/packages/vite/src/node/server/hmr.ts#L799-L963>
- Rolldown's owner-aware bundled-development graph, relevant only as future design evidence:
  <https://github.com/rolldown/rolldown/blob/111132357228f06c208af96f6f1f3c164104bdf3/crates/rolldown_plugin_hmr/src/runtime/runtime-extra-dev-common.js#L57-L170>
- React Refresh wrapper registration and boundary validation:
  <https://github.com/vitejs/vite-plugin-react/blob/8ae5449be23079dd17fdefc64064a3d94be6fc39/packages/common/refresh-utils.ts#L20-L64>
- React Refresh export registration, validation, and scheduling:
  <https://github.com/vitejs/vite-plugin-react/blob/8ae5449be23079dd17fdefc64064a3d94be6fc39/packages/common/refresh-runtime.js#L569-L648>
- Vite dynamic-import behavior:
  <https://github.com/vitejs/vite/blob/b59a73f76f5557492d83d097bb33b3dd02f27d51/docs/guide/features.md#dynamic-import>
- Vite dependency prebundling and discovery:
  <https://github.com/vitejs/vite/blob/b59a73f76f5557492d83d097bb33b3dd02f27d51/docs/guide/dep-pre-bundling.md#L1-L60>
- Vite 8's Rolldown dependency optimizer:
  <https://github.com/vitejs/vite/blob/b59a73f76f5557492d83d097bb33b3dd02f27d51/docs/guide/migration.md#L35-L62>
- Vite's Oxc development target and build-target precedence:
  <https://github.com/vitejs/vite/blob/b59a73f76f5557492d83d097bb33b3dd02f27d51/docs/guide/features.md#L81-L95>
- Vite's Oxc-powered production target:
  <https://github.com/vitejs/vite/blob/b59a73f76f5557492d83d097bb33b3dd02f27d51/docs/config/build-options.md#L3-L18>
- Rolldown's current output formats:
  <https://github.com/rolldown/rolldown/blob/111132357228f06c208af96f6f1f3c164104bdf3/packages/rolldown/src/options/output-options.ts#L53-L55>
- Taro's WeChat runtime host-config and component merge:
  <https://github.com/NervJS/taro/blob/0db37ec9d383ec774df54634a3db632286c0ffa1/packages/taro-platform-weapp/src/runtime.ts#L1-L6>
- Taro's native App and Page lifecycle metadata:
  <https://github.com/NervJS/taro/blob/0db37ec9d383ec774df54634a3db632286c0ffa1/packages/shared/src/runtime-hooks.ts#L78-L112>
- Taro's WeChat lifecycle augmentation:
  <https://github.com/NervJS/taro/blob/0db37ec9d383ec774df54634a3db632286c0ffa1/packages/taro-platform-weapp/src/runtime-utils.ts#L10-L18>
- Taro Page callback generation and exact return forwarding:
  <https://github.com/NervJS/taro/blob/0db37ec9d383ec774df54634a3db632286c0ffa1/packages/taro-runtime/src/dsl/common.ts#L249-L313>
- Taro React App configuration construction:
  <https://github.com/NervJS/taro/blob/0db37ec9d383ec774df54634a3db632286c0ffa1/packages/taro-framework-react/src/runtime/connect.ts#L275-L435>
- Taro React framework hook initialization:
  <https://github.com/NervJS/taro/blob/0db37ec9d383ec774df54634a3db632286c0ffa1/packages/taro-framework-react/src/runtime/index.ts#L1-L66>
- Taro API initialization after runtime hooks are installed:
  <https://github.com/NervJS/taro/blob/0db37ec9d383ec774df54634a3db632286c0ffa1/packages/taro/index.js#L1-L8>
- Taro's WeChat platform and template initialization:
  <https://github.com/NervJS/taro/blob/0db37ec9d383ec774df54634a3db632286c0ffa1/packages/taro-platform-weapp/src/program.ts#L10-L57>
- Taro's WeChat page-template generation:
  <https://github.com/NervJS/taro/blob/0db37ec9d383ec774df54634a3db632286c0ffa1/packages/taro-platform-weapp/src/template.ts#L107-L132>
- Taro's base component, WXS, recursive, and unrolled template generators:
  <https://github.com/NervJS/taro/blob/0db37ec9d383ec774df54634a3db632286c0ffa1/packages/shared/src/template.ts#L550-L673>
- Taro's matching compact hydration schema and component aliases:
  <https://github.com/NervJS/taro/blob/0db37ec9d383ec774df54634a3db632286c0ffa1/packages/taro-runtime/src/hydrate.ts#L29-L127>
- Taro's native `eh` event bridge:
  <https://github.com/NervJS/taro/blob/0db37ec9d383ec774df54634a3db632286c0ffa1/packages/taro-runtime/src/dom/event.ts#L154-L190>
- `weapp-tailwindcss` generator contract:
  <https://github.com/sonofmagic/weapp-tailwindcss/blob/c2262d743ad4fab4779576a7f54296eeb3e03338/packages/weapp-tailwindcss/src/generator/types.ts#L22-L55>
- `weapp-tailwindcss` Mini Program CSS finalization:
  <https://github.com/sonofmagic/weapp-tailwindcss/blob/c2262d743ad4fab4779576a7f54296eeb3e03338/packages/postcss/src/compat/mini-program-css/finalize.ts#L32-L83>

## Summary

The architecture has five owners:

1. **Native facades** synchronously register App and Pages and use one FIFO native-invocation relay to bridge
   asynchronous activation. Bundled Taro owns the callback surface and semantics; active forwarding preserves its
   exact callback results.
2. **SystemJS** owns the runtime registry keyed by Vite's module IDs, application loading, normal ESM live bindings, cycles, and
   deletion.
3. **The bundled Taro React stack and template ABI** own one retained App root, runtime host-tree rendering, Page sessions, events, and
   lifecycle dispatch.
4. **The dedicated Vite `wx` environment, Rolldown, and the System postprocessor** own source semantics, the application graph, and
   production optimization.
5. **The development HMR runtime and server** follow Vite boundary propagation, deliver fresh namespaces to accept callbacks, perform
   React Refresh without reconnecting old ESM importers, and hard-refresh whenever state-preserving replacement is unsafe.

Tailwind, the complete Taro implementation, and React build integration are bundled and plugin-owned. React itself is always installed
and owned by the application; this ownership boundary is closed and is not a future configuration choice. Package boundaries never
restrict source imports, production CSS is one `app.wxss`, Vite's module IDs flow unchanged into SystemJS, and stable development IDs keep
HMR contexts and React Refresh family identities coherent across updates. Unsafe updates and runtime-session replacement never replay or
approximate HMR; they converge through a complete hard refresh.
