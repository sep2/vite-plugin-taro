# WeChat Mini Program HMR

> Draft implementation notes for the development-only WX HMR path.

## Purpose

Browser HMR cannot be transferred directly to a WeChat Mini Program:

- the App Service does not load updated ESM from Vite over HTTP;
- JavaScript received through a socket cannot be executed with `eval()` or `new Function()`;
- rewriting `app.js` or shared chunks can restart App Service and destroy application state;
- changing a page entry can cause WeChat DevTools to create a throwaway page instance and invoke page lifecycles.

The implementation therefore separates control messages from executable code:

```text
Vite WebSocket (control plane)
    active page
    prepare page
    page ready

Generated files (code plane)
    immutable initial <page>.hmr.js
    append-only updates in <page>.js
```

The WebSocket never carries JavaScript source. Every update is ordinary JavaScript parsed by WeChat from a generated page file.

## Required invariants

A state-preserving page-code update must satisfy all of these conditions:

1. `app.js` is not modified.
2. Shared host chunks such as `taro.js`, `vendors.js`, `common.js`, and `runtime.js` are not modified.
3. The initial `<page>.hmr.js` payload is not modified.
4. Only the active page entry receives an appended suffix.
5. The existing App Service and Taro page remain alive.
6. React Refresh receives stable module and component identities.
7. Controlled input values are restored after the refresh.
8. JavaScript class names continue to match generated WXSS selectors.

Structural changes that cannot satisfy these invariants use a full regeneration instead.

## Starting development

The WX development path runs Vite in serve mode rather than `vite build --watch`:

```sh
VITE_PLUGIN_TARO_TARGET=wx vite
```

In the sample application this is exposed as:

```sh
npm run dev-wx
```

`createWxDevHmrPlugin()` is active only when the command is `serve` and the selected target is `wx`.

## Architecture

### Server modules

```text
src/vite/hmr.ts
    session orchestration and regeneration policy

src/vite/hmr/module-graph.ts
    page-rooted source graph, resolution, invalidation, shape checks

src/vite/hmr/factory-compiler.ts
    Vite/Oxc/Rolldown transformation into synchronous factories

src/vite/hmr/ast.ts
    Vite AST helpers for import.meta and class signatures

src/vite/hmr/class-signature.ts
    Tailwind class-shape guard

src/vite/hmr/page-transport.ts
    immutable bootstrap writes and append-only page updates

src/vite/hmr/protocol.ts
    typed custom WebSocket event names and messages
```

### Mini Program modules

```text
src/shim/dev-runtime.ts
    runtime composition and generated Page lifecycle wrappers

src/shim/module-runtime.ts
    factory registry, module cache, invalidation, React Refresh

src/shim/wx-hmr-client.ts
    Vite custom-event transport over wx.connectSocket

src/shim/taro-page-session.ts
    live/prepared/ignored page state machine

src/shim/taro-input-state.ts
    isolated Taro input capture and restoration adapter
```

`src/vite/targets/wx.ts` generates the development app/page entries and the static external registry. `src/vite/taro-css.ts` supplies the same class-name rewrite used by normal WX chunks and HMR factories.

## Initial startup

### 1. Build the managed source graph

Every configured page component is a graph root. The graph recursively follows static imports resolved through Vite.

A module is managed by HMR when it is:

- JavaScript, TypeScript, JSX, or TSX;
- under the application `src` directory;
- not a declaration file.

Everything else is an external, including:

- React and `react/jsx-runtime`;
- Taro virtual modules;
- npm dependencies;
- images and other imported assets;
- CSS and CSS modules.

For each managed module the graph stores:

```text
id                 normalized absolute module ID
code               Oxc-transformed JavaScript
classSignature     static className strings
importMap          source specifier -> runtime module ID
importers          managed modules importing this module
externalImports    statically loaded shell dependencies
```

The source transformation performs Taro conditional compilation when needed, then uses Vite 8's `transformWithOxc()` for TypeScript, JSX, and React Refresh instrumentation.

Static imports are read with `es-module-lexer`; resolution uses Vite's plugin container. The graph is rebuilt in memory after an edit instead of incrementally mutating edges. This favors correctness because the graph is small and page-rooted.

### 2. Build the Mini Program shell

The session starts a nested normal Vite build. It produces the standard WX files:

```text
app.js
runtime.js
taro.js
vendors.js
common.js
comp.js
pages/<route>.js
...
```

The development shell differs from a production build:

- the HMR runtime is initialized before the Taro React reconciler;
- `app.js` configures the WX WebSocket client;
- external dependencies are statically imported and registered;
- page entries register a stable `WxDevPageProxy` instead of importing page components;
- each page entry synchronously requires its initial `.hmr.js` before calling `Page(...)`.

The external registry resembles:

```js
import * as React from 'react'
import * as TaroApi from 'virtual:taro/api'

const runtime = getWxDevRuntime()
runtime.registerExternal('react', React)
runtime.registerExternal('virtual:taro/api', TaroApi)
```

This keeps all external loading in the ordinary Vite/Rolldown shell. The custom module runtime only executes application factories.

### 3. Create immutable initial payloads

After the shell build has initialized the WX Tailwind candidate set, the complete managed graph is compiled once. The same factory list is written to every configured page's bootstrap file:

```text
pages/calculator/index.hmr.js
pages/calculator/history/index.hmr.js
pages/calculator/monthly-payments/index.hmr.js
```

A generated page entry requires its bootstrap before page registration:

```js
const wxRequire = require
wxRequire('./index.hmr.js')
Page(createWxDevPageConfig(...))
```

The bootstrap installs all managed factories and all page root IDs. It does not eagerly execute every root. The stable page proxy executes the relevant root when Taro renders that page.

All bootstrap files share one payload version. If another page later loads its identical bootstrap, runtime versioning ignores it.

The `.hmr.js` file is immutable for normal hot updates. This is intentional: rewriting a predeclared dependency can restart App Service in DevTools.

## Compiling a factory with Vite 8

The HMR compiler does not use Babel for ESM-to-CommonJS conversion.

For each managed module it performs the following stages.

### 1. Apply the WX class-name transform

`transformWxRuntimeClassNames()` rewrites Tailwind class strings to the same Mini Program-safe names used by the shell build.

For example:

```text
bg-[rgba(35,201,147,1)]
```

may become:

```text
bg-_brgba_p35_m201_m147_m1_P_B
```

### 2. Normalize imports and `import.meta`

`es-module-lexer` locates static import specifiers. Each specifier is replaced with the resolved runtime ID from the module graph.

Vite's public `parseAst()` finds actual `import.meta` AST nodes. They are rewritten to an explicit `importMeta` factory argument without altering strings or comments.

Dynamic imports are rejected. The custom module runtime is synchronous and cannot safely reproduce Vite's asynchronous chunk loader inside App Service.

### 3. Ask Vite/Rolldown for CommonJS

`transformWithOxc()` deliberately preserves ESM, so module lowering is performed by an in-memory Vite library build:

```ts
build({
    configFile: false,
    build: {
        write: false,
        lib: { entry, formats: ['cjs'] },
        rolldownOptions: {
            external: id => id !== entry,
            treeshake: false,
            output: { exports: 'named' }
        }
    }
})
```

Every import remains external. Rolldown therefore converts one source module without bundling its managed dependencies into the factory.

Rolldown's CJS output assumes Node `require()` values and can emit `__toESM(value, 1)` for default imports. The HMR runtime already returns ESM namespace records, so the compiler removes that generated Node-only wrapper. Named output is forced so a default-only source module still writes `exports.default` instead of replacing `module.exports`.

### 4. Wrap the output

The final payload contains literal functions, not source strings:

```js
runtime.define({
    '/absolute/src/pages/index.tsx': function (module, exports, require, importMeta) {
        const $RefreshReg$ = (type, name) => runtime.registerRefresh(moduleId, type, name)
        const $RefreshSig$ = () => runtime.createRefreshSignature()

        // Vite/Rolldown CommonJS output
    }
}, metadata)
```

WeChat parses these functions as part of an ordinary generated JavaScript file. No dynamic code execution API is required.

## Runtime module system

`ModuleRuntime` maintains:

```text
factories   module ID -> current factory
modules     module ID -> evaluated exports
externals   module ID -> shell-provided namespace
roots       configured page root IDs
version     newest installed payload version
env         import.meta.env values
```

Its synchronous `require(id)` operation:

1. returns a registered external when present;
2. returns an evaluated module from the cache when present;
3. finds the current managed factory;
4. inserts an empty module record before evaluation for CommonJS-style cycles;
5. invokes the factory with `module`, `exports`, `require`, and `importMeta`;
6. removes the failed record if evaluation throws.

The runtime is also attached to `getApp()`. DevTools may execute page files in different page contexts; storing the runtime on App ensures they reuse one factory registry, module cache, and payload version.

There is no synthetic `import.meta.hot`. HMR acceptance is handled at page-root boundaries through graph invalidation and React Refresh.

## Stable page proxy

Development page entries register a stable component:

```js
function WxDevPageProxy(props) {
    return React.createElement(runtime.require(componentId).default, props)
}
```

The proxy and generated Taro page config do not change during a normal update. On every render the proxy reads the latest evaluated page export.

This preserves the outer Taro root and gives React Refresh stable component-family identities beneath it.

## Normal update flow

When a managed source file changes:

1. Vite calls `handleHotUpdate(file)`.
2. The graph records the old dependency and class signatures.
3. It collects the changed module and all transitive managed importers.
4. It rebuilds the graph from the configured page roots.
5. The session checks dependency shape, external shape, and class shape.
6. The active page is prepared through the control-plane handshake.
7. Only the changed module is compiled into a new factory.
8. The update payload contains that factory plus the complete invalidation list.
9. The payload is appended to the active page entry.
10. DevTools evaluates the appended suffix.
11. The runtime invalidates affected evaluated modules and re-requires every page root.
12. React Refresh updates mounted component families.
13. Captured Taro input state is restored.

An update payload has this general shape:

```js
runtime.define({
    '/absolute/src/components/example.tsx': function (...) {
        // replacement factory
    }
}, {
    version: 4,
    roots: ['/absolute/src/pages/index.tsx'],
    invalidate: [
        '/absolute/src/components/example.tsx',
        '/absolute/src/pages/index.tsx'
    ],
    env: {
        MODE: 'development',
        DEV: true,
        PROD: false,
        SSR: false
    }
})
```

Only the changed factory needs to be transported. Existing factories for invalidated importers remain in the registry and are re-evaluated after their cached module records are removed.

## Active-page selection and handshake

The Mini Program client reports a route from generated `onLoad` and `onShow` wrappers:

```text
vite-plugin-taro:wx-active-page
```

Before appending an update, the server sends:

```text
vite-plugin-taro:wx-prepare-page
```

The client marks the route as prepared and acknowledges:

```text
vite-plugin-taro:wx-page-ready
```

Only after the acknowledgement does the server append the page suffix. A 500 ms timeout prevents a disconnected client from blocking compilation indefinitely.

The ordering matters because DevTools may construct a phantom page and call lifecycle hooks when it notices the changed page entry. The session must be in the prepared state before that activity begins.

If no active page has been reported, the server appends the versioned payload to every configured page entry. Duplicate evaluation remains safe because old or equal versions are ignored.

## Append-only page transport

A normal update uses `appendFile()` on:

```text
pages/<active-route>.js
```

The file evolves as:

```text
immutable page shell
update payload version 2
update payload version 3
update payload version 4
...
```

The initial factories remain in the separate immutable `.hmr.js` required by the shell.

Appending is the critical transport behavior: in testing, DevTools applied an added page suffix without restarting App Service. Rewriting `app.js`, a shared chunk, or the initial dependency did not provide the same state guarantee.

The page entry grows during a development session. A full regeneration or server restart replaces it with a fresh compact shell.

## Applying an update

`ModuleRuntime.install()` ignores stale or duplicate versions. For a new hot payload it:

1. captures input state from the active Taro root;
2. removes every invalidated module from the evaluated-module cache;
3. replaces incoming factories;
4. records current roots and `import.meta.env` values;
5. synchronously requires all roots, evaluating affected chains;
6. schedules one React Refresh for the batch;
7. restores captured input state after React/Taro commits.

Unaffected factories and evaluated modules retain their singleton state.

## React Refresh

The implementation uses the official `react-refresh/runtime` package.

The global refresh hook is installed before `@tarojs/react` creates its reconciler. Oxc-generated `$RefreshReg$` calls are scoped with the normalized absolute module ID:

```text
<module ID> <component name>
```

After invalidated roots have been evaluated, `performReactRefresh()` updates the mounted Taro React tree.

Compatible component signatures preserve hooks, refs, and mounted subtree state. A changed hook order or otherwise incompatible signature may remount the affected component, matching normal React Fast Refresh semantics.

## Taro page session state

`TaroPageSessions` owns one state machine per generated route:

```text
unmounted -> live -> prepared -> live
```

It also tracks phantom page objects in a `WeakSet`.

When a prepared route receives a new `onLoad`, that page instance is marked ignored. Its `onReady`, `onShow`, `onHide`, and `onUnload` handlers do not replace or tear down the live Taro root.

The live root is captured from Taro's document using `$taroPath`. The adapter binds the page context and flushes Taro child nodes when necessary, preventing an empty page when DevTools lifecycle timing interrupts normal initialization.

A real unload is distinguished from a phantom unload by deferring the check and confirming whether the same `$taroPath` still exists in `getCurrentPages()`.

## Controlled input preservation

React Refresh alone did not preserve every controlled Mini Program input in DevTools. Before invalidation, the adapter walks the active Taro node tree and records input values by stable private `_path`.

The current serialized input value is read from Taro's `p25` field, falling back to the node value.

After refresh the adapter:

1. finds the corresponding input node;
2. obtains its latest `__reactProps$...` record;
3. calls the newest `onInput` handler with the preserved value;
4. calls `page.setData()` for the matching `p25` path;
5. flushes child nodes and calls `performUpdate(true)`.

Calling the application handler restores React/application state. Updating `p25` keeps the native input stable while React and Taro complete asynchronous work.

These are private Taro implementation details and are deliberately isolated in `taro-input-state.ts`.

## Tailwind and WXSS safety

The shell and HMR factories must use identical Mini Program-safe class names. The shared runtime class transform provides that correspondence for classes already present in the generated WXSS.

A code-only update cannot add a new WXSS rule. The graph therefore computes a stable signature from static strings inside transformed `className` properties using Vite's AST parser.

If that signature changes, the session performs a full regeneration instead of appending a JavaScript-only update. This is conservative but prevents new or changed Tailwind classes from rendering without matching styles.

Direct CSS, Sass, Less, Stylus, or other style-source changes also regenerate the shell.

## Full-regeneration policy

A full regeneration rebuilds the graph, shell, external registry, and initial payloads. It is used when:

| Change | Reason |
| --- | --- |
| Style source changes | WXSS must be regenerated. |
| A static managed import edge changes | Factory/dependency shape changed. |
| The external import set changes | The static shell registry changed. |
| Static `className` strings change | Tailwind candidate/WXSS shape may have changed. |
| A JS/TS file outside the current page graph changes | It is not safely addressable by the current factory graph. |
| App/config/other Mini Program shape files change | Generated shell metadata may have changed. |

Declaration-file changes are ignored because they have no runtime output.

A full regeneration may cause DevTools to reload App Service. It intentionally does not promise preservation of App state, page identity, or input values.

## Supported state-preserving edit boundary

The append-only path is intended for implementation edits inside an existing managed module while all of these remain stable:

- static managed dependency edges;
- external imports;
- static Tailwind class strings;
- page/app configuration;
- React Refresh-compatible component signatures when hook state must be retained.

Typical label text, calculations, event-handler logic, and component implementation changes stay on this path.

## Current limitations

- Dynamic `import()` is unsupported by the synchronous factory runtime.
- Page entry files grow until a regeneration or server restart.
- The class-shape guard follows static strings reachable from transformed `className` values; highly indirect runtime class construction cannot be proven safe.
- React may remount a component when its Fast Refresh signature is incompatible.
- Input restoration depends on Taro's current `_path`, `p25`, `__reactProps$...`, and `performUpdate(true)` representation.
- Structural changes intentionally trade state preservation for correctness through regeneration.

## Observed verification

The state-preserving path has been exercised across repeated updates with the following probes:

- the visible label updated on every edit;
- `贷款金额` remained `999`;
- a value stored on `globalThis` remained unchanged;
- a value stored on `getApp()` remained unchanged;
- `$taroTimestamp` remained unchanged;
- `app.js` remained byte-for-byte unchanged;
- the initial page `.hmr.js` remained byte-for-byte unchanged;
- generated Tailwind styles remained correct;
- no HMR module-resolution or React Refresh error was emitted.

These observations demonstrate the required upper-level guarantee for normal eligible edits: the update changes page implementation code without restarting App Service or replacing the live page.
