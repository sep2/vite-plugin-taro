## Overview

This is not normal browser Vite HMR. WeChat cannot load updated ESM over HTTP or execute received JavaScript with `eval()`.

Instead, the implementation has two planes:

```text
Control plane: Vite WebSocket
    active page detection
    page-reload preparation/acknowledgement

Code plane: generated page entry
    static JavaScript factories appended to pages/.../index.js
```

No JavaScript source is sent through the WebSocket, and `app.js` never loads an HMR payload.

---

## 1. Initial startup

When running:

```bash
npm run dev-wx
```

`createWxDevHmrPlugin()` activates only for:

- Vite `serve`
- target `wx`

It then performs these steps.

### Build the page module graph

Each configured page TSX file is a graph root:

```text
pages/calculator/index.tsx
pages/calculator/history/index.tsx
pages/calculator/monthly-payments/index.tsx
```

The graph recursively resolves their source imports through Vite.

Modules are classified as:

- **Managed source modules**: JS/TS/TSX files under `src`
- **Externals**: React, Taro virtual modules, npm packages and styles

For every managed module, the graph stores:

- transformed source
- resolved imports
- dependencies
- importers
- external imports

### Build the static Mini Program shell

A nested Vite build emits the regular Mini Program structure:

```text
app.js
taro.js
vendors.js
common.js
pages/calculator/index.js
...
```

In development:

- `app.js` initializes the HMR runtime and WebSocket.
- `app.js` creates the real Taro application.
- Page entries register a stable `WxDevPageProxy`.
- External dependencies are statically imported into an external registry.
- No page HMR payload is imported by `app.js`.

The HMR runtime is imported before `@tarojs/react`, allowing React’s reconciler to register with the React Refresh hook.

### Append initial payloads to page entries

The complete managed module graph is compiled into factory functions and appended directly to every page entry:

```js
/* vite-plugin-taro wx HMR payload */
(function () {
    const runtime = globalThis.__VITE_PLUGIN_TARO_WX_HMR__

    runtime.define({
        '/src/pages/calculator/index.tsx': function (
            module,
            exports,
            __import,
            __export,
            __reexport,
            importMeta
        ) {
            // Transformed page module
        }
    }, {
        version: 1,
        roots: [...],
        invalidate: [],
        env: {...}
    })
})()
```

The payload is physically part of the page entry. It is not a separate JS file.

That distinction is important: modifying a separate JS dependency caused DevTools to restart App Service, while appending code to the page entry can be hot-applied.

---

## 2. Compiling modules into factories

WeChat cannot execute source received over the network, so there is no `eval()` or `new Function()`.

Instead, source is compiled ahead of time into literal function declarations.

### Oxc transformation

`transformWxSource()` performs:

1. Taro conditional compilation.
2. TypeScript/JSX transformation.
3. React Refresh instrumentation.
4. WX Tailwind class-name transformation.

For example, JSX is converted to calls using `react/jsx-runtime`, and React Refresh adds registrations such as:

```js
$RefreshReg$(LoanGenius, 'LoanGenius')
$RefreshSig$()
```

### ESM-to-factory transformation

A Babel transform rewrites ESM constructs:

```js
import Foo from './foo'
export default Component
export { value }
import.meta
```

into runtime operations resembling:

```js
const imported = __import('/absolute/path/foo.ts')
const Foo = imported.default

__export('default', () => Component)
__export('value', () => value)

importMeta
```

Exports use getters so they remain live bindings.

### Static dependency registry

Npm/Taro/React modules cannot be dynamically loaded by the factory system. They are imported normally by the shell and registered:

```js
runtime.registerExternal('react', ReactNamespace)
runtime.registerExternal('virtual:taro/api', TaroApi)
```

A factory calling:

```js
__import('react')
```

therefore reads an already-loaded static module.

---

## 3. Runtime module system

`WxDevHmrRuntime` maintains:

```text
factories   module ID -> factory function
modules     module ID -> evaluated module
externals   external ID -> static exports
roots       page root module IDs
version     latest applied payload version
```

Its `require(id)` operation:

1. Checks the external registry.
2. Returns a cached evaluated module when possible.
3. Finds the managed factory.
4. Creates the module record before execution, allowing basic cycles.
5. Invokes the factory with runtime import/export helpers.
6. Caches and returns its exports.

Factories also receive a minimal `import.meta.hot`:

```js
{
    data,
    accept() {},
    dispose(callback) {}
}
```

This implementation does not use Vite’s browser ESM loader. It is a small CommonJS-like module runtime specifically for WX development.

---

## 4. Page proxy

The Mini Program page is registered with a stable React component:

```js
function WxDevPageProxy(props) {
    const Component = runtime.require(componentId).default
    return React.createElement(Component, props)
}
```

The page shell itself does not statically import the page component.

This means:

- The Taro page/root identity remains stable.
- The proxy reads the newest module exports on every render.
- React Refresh can replace the underlying component family without replacing the whole page configuration.

---

## 5. Detecting an update

Vite calls `handleHotUpdate(file)`.

### Normal HMR path

A file is eligible when it is:

- JS/TS/JSX/TSX
- under `src`
- already part of a page dependency graph

The graph determines the invalidation chain:

```text
changed module
    -> importer
        -> importer
            -> affected page root
```

Then it rebuilds its in-memory relationships and emits:

- only the changed factory
- the complete invalidated-module ID list

### Full regeneration path

The shell is rebuilt instead when changing:

- CSS or other style files
- declaration files
- app/config/shape-related files
- a source file outside the page graph
- the set of static external imports

Those cases may reload App Service and do not provide the same state guarantee.

---

## 6. Selecting the target page

Each page reports itself over the Vite WebSocket from `onLoad` and `onShow`:

```text
vite-plugin-taro:wx-active-page
```

The server remembers the active page.

Therefore, normal updates touch only:

```text
pages/<active-page>.js
```

They do not touch:

```text
app.js
taro.js
vendors.js
common.js
```

If no active page is known yet, the server appends the update to all page entries. Payload versioning prevents duplicate application.

---

## 7. Why the payload is appended

The update uses:

```ts
appendFile(pageEntry, payload)
```

rather than rewriting the complete page file.

The resulting page entry becomes:

```text
static page shell
initial full-graph payload
update payload version 2
update payload version 3
...
```

DevTools observes a suffix added to the page entry and executes that page fragment without restarting App Service.

This is the key state-preserving behavior.

The page file grows during the session. A full regeneration or server restart compacts it back to a fresh shell and initial payload.

---

## 8. Applying an update

When the appended fragment executes:

```js
runtime.define(changedFactories, {
    version: 2,
    invalidate: [
        'changed-module',
        'its-importer',
        'affected-page-root'
    ]
})
```

The runtime:

1. Ignores stale or duplicate versions.
2. Captures current input values.
3. Saves previous exports of loaded invalidated modules.
4. Runs their dispose callbacks.
5. Removes invalidated modules from the evaluated cache.
6. Replaces the changed factory.
7. Re-requires all page roots.

Unchanged factories and evaluated modules remain cached.

Because importer modules were invalidated, they observe the new dependency exports when re-evaluated.

---

## 9. React Refresh

The runtime embeds the React Refresh runtime used by Vite’s React plugin.

Each component registration gets a stable family ID:

```text
<absolute module ID> + <component name>
```

After re-evaluation, the runtime compares previous and next exports and performs React Refresh.

The Taro React reconciler receives:

- a refresh-family resolver
- the updated/stale family sets
- a request to refresh mounted roots

When component signatures are compatible, React preserves:

- `useState`
- `useRef`
- component identity
- mounted subtree state

If hook order or component shape becomes incompatible, React Refresh may remount that component, matching normal Fast Refresh semantics.

---

## 10. Taro page preservation

The runtime captures the active Taro page:

```text
$taroPath
$taroParams
pageElement
```

Before changing the page entry, the server sends:

```text
vite-plugin-taro:wx-page-update
```

The runtime marks that page as expecting an update and acknowledges it.

If DevTools invokes page lifecycle registration during the update, the wrappers:

- suppress the expected `onUnload`
- reuse the old `$taroPath`
- reattach the existing Taro root element
- restore `Current.page` and `Current.router`
- avoid duplicate `onReady`/`onShow`
- trigger Taro’s recovery context action

For the normal append-only path, the page timestamp remains unchanged and this recovery path is mostly defensive.

---

## 11. Input preservation

React state preservation alone was insufficient for the controlled loan input in DevTools.

Before invalidation, the runtime walks the Taro element tree and records input values by stable Taro path:

```text
root.cn.[0].cn.[1]....input
    -> "999"
```

After React Refresh:

1. It finds the corresponding updated input node.
2. It retrieves the newest React `onInput` handler.
3. It invokes that handler with the preserved value.
4. It flushes the Taro child-node representation.
5. It calls `performUpdate(true)` to synchronize Mini Program data.

The value is restored through application state, rather than merely patching the rendered DOM node.

That is why the tested `贷款金额` value remains `999`.

---

## 12. Tailwind/WX styles

WX cannot directly use arbitrary Tailwind class names such as:

```text
bg-[rgba(35,201,147,1)]
```

`weapp-tailwindcss` converts them to safe names:

```text
bg-_brgba_p35_m201_m147_m1_P_B
```

The mechanism has two matching transformations:

### CSS side

Tailwind generates WXSS selectors using escaped Mini Program-safe names.

### JavaScript side

`renderChunk()` rewrites class strings before Rolldown serializes the JS chunk.

Doing this in `generateBundle()` was too late: Rolldown could overwrite the mutated chunk code, which caused the broken styles.

### HMR factory side

The same Tailwind runtime candidate set is shared with `transformWxSource()`. Therefore, code inside appended HMR factories receives exactly the same escaped class names as the initial page shell.

After the shell build creates the Tailwind candidate set, the source graph is rebuilt once so the initial payload also receives those transformed names.

---

## 13. Important invariants

For a successful page-code update:

```text
app.js is unchanged
shared host chunks are unchanged
only the active page entry is appended
App Service remains alive
the Taro page identity remains alive
React Refresh swaps component families
input state is restored
```

The observed proof was:

- Same global probe.
- Same property stored on `getApp()`.
- Same `$taroTimestamp`.
- Label changed immediately.
- Input remained `999`.
- Styles remained correct.
- No HMR module-resolution errors.

---

## 14. Current boundaries

The state-preserving path applies to existing JS/TS modules in a page graph with a stable dependency shape.

Full regeneration is still used for structural changes, including styles and app/config changes. Those updates can reload App Service.

Other current limitations:

- `import.meta.hot.accept()` is only a compatibility stub; invalidation propagates to page roots.
- Page files grow append-only until regeneration.
- React can remount components when hook signatures are incompatible.
- Newly introduced internal dependency files need explicit graph-shape handling; the current delta payload normally emits only the changed module.
- Newly introduced Tailwind candidates may require CSS regeneration.
- Generic input restoration depends on the input exposing an `onInput` handler.

The core implementation is in:

- `packages/vite-plugin-taro/src/vite/hmr.ts`
- `packages/vite-plugin-taro/src/shim/dev-runtime.ts`
- `packages/vite-plugin-taro/src/vite/targets/wx.ts`
- `packages/vite-plugin-taro/src/vite/taro-css.ts`
