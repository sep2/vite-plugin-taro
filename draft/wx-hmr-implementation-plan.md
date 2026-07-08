# WeChat Mini Program Dev HMR Plan — Clean Architecture

The goal is to implement wx dev HMR with the same conceptual pieces as web HMR:

- Vite dev server owns the module graph and transforms.
- A wx-specific runtime owns module execution inside Mini Program appservice.
- `dist/wx/hmr/update.js` is the executable transport because WeChat cannot execute streamed JS text.

## 1. Core idea

Web Vite HMR works because the browser can execute updated modules by URL:

```js
import('/src/components/foo.tsx?t=123')
```

WeChat Mini Program cannot do that. It has no browser ESM loader and forbids `eval`/`new Function`. Therefore the only major architectural difference is **code execution transport**:

```text
web: Vite WS message -> browser imports updated module URL
wx:  Vite dev event -> plugin writes dist/wx/hmr/update.js -> DevTools executes changed file
```

Everything else should stay as close to Vite/web HMR concepts as possible:

- stable logical module IDs
- module graph invalidation
- module factory replacement
- React Refresh family registration
- refresh boundary validation
- full reload fallback for incompatible updates

## 2. Desired dev output shape

```text
dist/wx/app.js
dist/wx/app.json
dist/wx/app.wxss                # can be coarse/full-regenerated initially
dist/wx/base.wxml
dist/wx/utils.wxs
dist/wx/comp.js
dist/wx/comp.json
dist/wx/comp.wxml
dist/wx/pages/**/index.js
dist/wx/pages/**/index.json
dist/wx/pages/**/index.wxml
dist/wx/pages/**/index.wxss

dist/wx/common/taro.js           # framework/runtime/vendor bucket, exact shape TBD
dist/wx/common/vendor.js         # third-party bucket, exact shape TBD

dist/wx/hmr/runtime.js           # stable wx HMR + React Refresh runtime
dist/wx/hmr/bootstrap.js         # initial logical source module factories
dist/wx/hmr/update.js            # no-op initially; overwritten on hot update
```

For a React-only implementation update, the dev contract is:

```text
React module implementation changed -> write only hmr/update.js
Mini Program shape changed         -> rewrite affected wx output and let DevTools reload/recompile
```

In this document, **React module implementation changed** means edits that can be represented by replacing one or more logical JS/TS/TSX module factories without changing the wx shell: component render logic, local helpers, constants, hooks, and newly imported JS source modules when they can be embedded into the update payload.

**Mini Program shape changed** means edits that alter files or metadata WeChat compiles outside the React runtime: app/page registration, routes, JSON config, WXML/template structure, native/custom component topology, WXSS/assets when not separately supported, or vendor/framework bundle structure.

Only the first category should keep `app.js`, page entries, `common/*`, and `hmr/bootstrap.js` stable. The second category should intentionally rewrite the affected stable files and accept a full reload.

## 3. Commands / mode split

Change wx dev from build-watch to real Vite dev server.

Current style:

```sh
vite build --watch
```

Target style:

```sh
vite --host 127.0.0.1
# equivalent to: vite dev --host 127.0.0.1
```

The Vite server is not used by Mini Program as a browser runtime. It is used by the plugin as:

- file watcher
- module graph
- transform pipeline
- dependency resolver
- React Refresh transform source
- invalidation engine

The plugin writes executable wx files to `dist/wx`.

Production wx remains normal `vite build`.

## 4. High-level components

Start with a small file split. Do not pre-create a large module tree.

Suggested first-pass organization:

```text
packages/vite-plugin-taro/src/vite/targets/wx.ts          # existing wx build/prod config and public integration
packages/vite-plugin-taro/src/vite/targets/wx-dev.ts      # wx dev server plugin, dev session, shell/update writing
packages/vite-plugin-taro/src/vite/targets/wx-runtime.ts  # generated runtime/bootstrap/update code strings
```

Split further only when a file becomes too large or mixes unrelated responsibilities. Likely future split points, if needed:

```text
module compiler / factory generation
logical module ID and path normalization
wx shell/assets writer
update payload writer
vendor/framework external mapping
```

Code quality rule:

```text
Start with 2–3 files.
Do not pre-create ten tiny modules.
Do not let wx.ts become a 1000-line feature dump.
```

## 5. Vite plugin lifecycle

Add a wx dev plugin that runs only when:

- target is `wx`
- Vite command is `serve` (`vite` / `vite dev`; Vite's plugin API names dev-server mode `serve`, not `dev`)
- not production

Pseudo-shape:

```ts
export function createVitePluginTaroWechatDevPlugin(context): Plugin {
  let session: WxDevSession | undefined

  return {
    name: 'vite-plugin-taro-wx-dev',
    apply: 'serve',
    configureServer(server) {
      session = new WxDevSession(context, server)
      session.start()
    },
    handleHotUpdate(ctx) {
      return session?.handleHotUpdate(ctx) ?? ctx.modules
    }
  }
}
```

`WxDevSession.start()` should:

1. clean generated wx output safely
2. write Mini Program shell files
3. compile/write initial framework/vendor files if needed
4. compile/write initial logical source factories to `hmr/bootstrap.js`
5. write `hmr/runtime.js`
6. write no-op `hmr/update.js`
7. start listening to file changes through Vite

## 6. Logical module identity

Intent: mirror Vite/web HMR semantics. A React component's refresh identity should be tied to the source module that defines it, not to a generated wx output file.

On web, Vite refreshes source module identities such as:

```text
/src/app.ts
/src/pages/calculator/index.tsx
/src/components/navigation-bar/navigation-bar.tsx
```

The wx runtime should use the same kind of identity even though it cannot execute those modules by URL. `hmr/bootstrap.js` and `hmr/update.js` should both refer to the same logical source identity, so an update can replace the module factory while React Refresh still recognizes the component family.

Example React Refresh family identity:

```text
/src/components/navigation-bar/navigation-bar.tsx NavigationBar
```

Do not base React Refresh identity on generated wx files such as `app.js`, `common/taro.js`, or any temporary update payload file. Those files are transport/build artifacts; changing them should not change the logical identity of the React component.

The exact normalization rules should follow Vite's module-id semantics as closely as practical, including preserving meaningful virtual/query identities when they affect module meaning.

## 7. Runtime architecture

`dist/wx/hmr/runtime.js` should install a global runtime:

```js
var g = typeof globalThis !== 'undefined' ? globalThis : global
var hmr = g.__VITE_PLUGIN_TARO_WX_HMR__
```

Runtime responsibilities:

### 7.1 Module registry

```ts
type ModuleRecord = {
  id: string
  factory: Factory
  exports: Record<string, unknown>
  initialized: boolean
  parents: Set<string>
  children: Set<string>
  hot?: HotContext
}
```

Public methods:

```js
hmr.define(id, deps, factory)
hmr.require(id)
hmr.resolve(fromId, specifier)
hmr.applyUpdate(payload)
hmr.markReady()
hmr.fullReload(reason)
```

Factories should be synchronous CommonJS-style functions:

```js
function factory(require, module, exports, hot) {
  // compiled module code
}
```

### 7.2 Dependency tracking

`require` inside a factory must:

- resolve logical source imports to logical IDs
- resolve framework/vendor externals to local wx `require(...)`
- track parent/child relationships
- return cached exports unless invalidated

### 7.3 Update application

`hmr.applyUpdate(payload)` should:

1. ignore if `hmr.ready !== true`
2. register new/changed factories
3. dispose old module instances where supported
4. invalidate changed modules and necessary importers
5. re-execute affected refresh boundaries
6. register React exports
7. call `performReactRefresh()`
8. full reload on incompatible update

### 7.4 React Refresh bridge

Adapt Vite React Refresh runtime for Mini Program global object:

- no browser `window` dependency
- install global hook before React/Taro renderer initializes
- define `$RefreshReg$` and `$RefreshSig$`
- expose helpers:

```js
hmr.refresh = {
  register,
  performReactRefresh,
  registerExportsForReactRefresh,
  validateRefreshBoundaryAndEnqueueUpdate
}
```

## 8. Shell files

### 8.1 `app.js`

Generated shape:

```js
require('./hmr/runtime.js')
require('./hmr/bootstrap.js')
require('./hmr/update.js') // stale update is guarded and returns during cold start

const hmr = global.__VITE_PLUGIN_TARO_WX_HMR__
const React = require('./common/vendor.js').react // exact export shape TBD
const { createReactApp, ReactDOM } = require('./common/taro.js')
const AppComponent = hmr.require('/src/app.ts').default

App(createReactApp(AppComponent, React, ReactDOM, APP_CONFIG))
hmr.markReady()
```

Important ordering:

- `runtime.js` first
- `bootstrap.js` second
- `update.js` before `markReady()` so stale update files do not execute during cold start
- call `markReady()` only after normal app registration succeeds

### 8.2 Page entries

Generated page entry shape:

```js
require('../../hmr/runtime.js')
require('../../hmr/bootstrap.js')
require('../../hmr/update.js')

const hmr = global.__VITE_PLUGIN_TARO_WX_HMR__
const { createPageConfig } = require('../../common/taro.js')
const PageComponent = hmr.require('/src/pages/foo/index.tsx').default

const taroPageConfig = createPageConfig(PageComponent, 'pages/foo/index', { root: { cn: [] } }, PAGE_CONFIG)
Page(taroPageConfig)
```

### 8.3 `comp.js`

Keep recursive Taro component config stable:

```js
require('./hmr/runtime.js')
require('./hmr/update.js')
const { createRecursiveComponentConfig } = require('./common/taro.js')
Component(createRecursiveComponentConfig())
```

## 9. `hmr/bootstrap.js`

`bootstrap.js` contains the initial logical source module factories:

```js
require('./runtime.js')
;(function () {
  var hmr = global.__VITE_PLUGIN_TARO_WX_HMR__
  hmr.define('/src/components/foo.tsx', { './bar': '/src/components/bar.ts' }, function (require, module, exports, hot) {
    // compiled source module
  })
})()
```

It should be generated once at dev session start and regenerated only on fallback/full snapshot rebuild.

## 10. `hmr/update.js`

Initial no-op:

```js
require('./runtime.js')
```

Hot update shape:

```js
require('./runtime.js')
;(function () {
  var hmr = global.__VITE_PLUGIN_TARO_WX_HMR__
  if (!hmr || !hmr.ready) return

  hmr.applyUpdate({
    timestamp: 123,
    modules: {
      '/src/components/foo.tsx': {
        deps: { './bar': '/src/components/bar.ts' },
        factory: function (require, module, exports, hot) {
          // compiled updated module
        }
      },
      '/src/components/new-child.tsx': {
        deps: {},
        factory: function (...) {}
      }
    },
    boundaries: ['/src/components/foo.tsx']
  })
})()
```

No `eval`. The changed file itself is executable JS.

## 11. Module compiler

This is the most important design point. We need transformed source modules as synchronous factories.

Do **not** implement this with regex-only import/export rewriting.

Prototype and choose one of these approaches:

### Option A — Vite SSR transform adaptation

Use Vite dev server transforms and SSR transform output if it can be converted into sync factories reliably.

Pros:

- closest to Vite internals
- uses Vite graph and plugin transforms

Risks:

- SSR output may use async helpers
- internals may be unstable in Vite 8

### Option B — In-memory Rolldown/Rollup preserve-modules compiler

Use Vite plugin container transforms, then run an in-memory preserve-modules compilation to CJS-like output. Do not write preserve modules to disk; embed output chunks into `bootstrap.js`/`update.js` factories keyed by logical IDs.

Pros:

- avoids hand-implementing ESM semantics
- handles imports/exports/re-exports/barrels more robustly
- supports new files naturally if included in update payload

Risks:

- more integration work
- must keep logical IDs stable despite generated chunks

### Option C — AST ESM-to-factory compiler

Use OXC/Babel/SWC AST transforms to rewrite ESM to runtime calls.

Pros:

- maximal control
- no physical chunks

Risks:

- easy to get live bindings/circular imports wrong
- more long-term maintenance

Recommendation: prototype Option B first. Fall back to Option C only if necessary.

## 12. Externalization strategy

Logical source factories should not bundle all framework/vendor code.

Classify imports:

1. **Project source** -> logical IDs handled by `hmr.require`
2. **Virtual Taro modules** -> framework/common wx require mapping
3. **React/Taro/runtime dependencies** -> `common/taro.js` / `common/vendor.js`
4. **CSS/assets** -> full snapshot fallback or coarse asset rewrite initially

The runtime needs an external resolver table, e.g.:

```js
hmr.externals = {
  'react': function () { return require('../common/vendor.js').react },
  'virtual:taro/api': function () { return require('../common/taro.js').api },
  'virtual:taro/components': function () { return require('../common/taro.js').components }
}
```

Exact export names can be generated; do not hardcode fragile minified names.

## 13. `virtual:taro/api` ordering

Keep the existing minimal ordering fix:

```ts
// Ensure Taro's React runtime registers its `initNativeApi` hook before @tarojs/taro is initialized.
import '@tarojs/plugin-framework-react/dist/runtime'
import { hooks } from '@tarojs/runtime'
import Taro from '@tarojs/taro'
```

Do not manually import/export every lifecycle hook. The point is only to ensure Taro React registers `initNativeApi` before `@tarojs/taro` is initialized.

This prevents errors like:

```text
TypeError: Taro.useLaunch is not a function
```

when HMR introduces early execution paths.

## 14. Handling new components/files

Example edit:

```tsx
// existing component
import { NewThing } from './new-thing'
```

and `new-thing.tsx` is newly created.

Hot payload should include both:

```text
/src/components/existing.tsx
/src/components/new-thing.tsx
```

Because both factories are embedded in `hmr/update.js`, no new physical JS file is needed.

Fallback only if:

- new file changes app/page route topology
- new file is outside supported JS/TS/TSX source graph
- compiler cannot resolve the import safely
- source graph contains unsupported dynamic import behavior

## 15. Hot update algorithm

On `handleHotUpdate(ctx)`:

1. Normalize changed file ID.
2. Classify change:
   - source JS/TS/TSX edit/add/delete
   - app/page config change
   - CSS/asset/template change
   - unknown
3. For eligible source changes:
   - use Vite module graph to find affected modules
   - find nearest React Refresh boundaries
   - include changed modules plus required new dependencies
   - compile factories
   - write `hmr/update.js`
4. For fallback changes:
   - regenerate full wx snapshot
   - write no-op `hmr/update.js`
   - let DevTools perform normal reload/recompile

Pseudo:

```ts
async handleHotUpdate(ctx) {
  const change = classify(ctx)
  if (!change.isJsSource) return fullSnapshot(change.reason)

  const plan = analyzeAffectedGraph(ctx.modules)
  if (!plan.canHotUpdate) return fullSnapshot(plan.reason)

  const payload = await compileUpdatePayload(plan.modules)
  await writeUpdateJs(payload)
  return [] // prevent normal Vite browser HMR work for wx target
}
```

## 16. Refresh boundary rules

Use React Refresh semantics, not ad-hoc component replacement.

For each updated module:

- register component exports with stable IDs
- validate refresh boundary compatibility
- if compatible, re-execute module/importers as needed and call `performReactRefresh()`
- if incompatible, fallback full snapshot/reload

Known acceptable fallbacks:

- edited class component state is not preserved
- hook signature incompatibility
- mixed non-component exports that invalidate boundary
- app entry changes
- route/config/template/native topology changes

## 17. Full snapshot fallback

A full snapshot rebuild should rewrite stable wx output:

- shell entries
- JSON/WXML/WXSS assets
- framework/vendor bundles if needed
- `hmr/bootstrap.js`
- no-op `hmr/update.js`

It should preserve WeChat private files:

```text
project.private.config.json
```

It should not rely on mtime-only hacks as the main mechanism, but changing normal app/page/bootstrap files during fallback is acceptable because fallback means reload/recompile.

## 18. Project config

In wx dev output, set:

```json
{
  "setting": {
    "compileHotReLoad": true
  }
}
```

Do not force this in production.

Merge with user `projectConfigJson.setting`.

## 19. WXML `nn` fallback

If React Refresh/Taro transiently emits missing `nn`, WeChat can warn:

```text
Template `tmpl_0_undefined` not found
```

Prefer to fix the data source. If still reproducible, add dev-only empty fallback templates:

```xml
<template name="tmpl_0_undefined"></template>
<template name="tmpl_0_null"></template>
<template name="tmpl_0_false"></template>
<template name="tmpl_0_"></template>
```

Do not include these in production.

## 20. CSS/assets scope

For this implementation pass:

- JS/TS/TSX React HMR is the priority.
- CSS/assets may trigger full snapshot fallback.
- Do not block the JS architecture on CSS HMR.

Later CSS support can write WXSS outputs separately or use a similar file-backed update signal if DevTools supports it cleanly.

## 21. Acceptance criteria

### 21.1 Production

Run:

```sh
pnpm build:sample:wx
pnpm build:sample:h5
pnpm typecheck
pnpm exec biome check <modified files>
```

Production wx must not contain dev HMR markers:

```sh
! rg "hmr/update|hmr/bootstrap|__VITE_PLUGIN_TARO_WX_HMR__|__VITE_PLUGIN_TARO_REACT_REFRESH__|\\$RefreshReg|tmpl_0_undefined" packages/loan-genius/dist/wx -n
```

### 21.2 Dev first load

```sh
rm -rf packages/loan-genius/dist/wx
pnpm dev:sample:wx
```

Open `dist/wx` in WeChat DevTools.

Must not throw:

```text
ReferenceError: init_* is not defined
TypeError: Taro.useLaunch is not a function
TypeError: Cannot read property 'useMemo' of undefined
TypeError: require_common_taro.init_dist$1 is not a function
```

### 21.3 Reopen with stale update

After a hot update, close and reopen the wx folder while dev server is running.

Expected:

- no stale update crash
- `hmr/update.js` cold-start guard prevents early execution
- app loads normally

### 21.4 Existing component edit

Edit:

```text
src/components/navigation-bar/navigation-bar.tsx
```

Expected:

- only `dist/wx/hmr/update.js` changes
- active page refreshes without Mini Program full reload when React Refresh accepts the boundary

### 21.5 New component file

Add:

```text
src/components/new-thing.tsx
```

Import it from an existing active component.

Expected preferred behavior:

- `hmr/update.js` includes both importer and new module factory
- refresh works if boundary-compatible

Acceptable fallback for first iteration:

- full snapshot/reload with no crash

But the architecture should not make new-file support impossible.

### 21.6 Unsupported edits

App entry, route config, page list, WXML/template topology, and CSS/assets may full reload.

They must not corrupt runtime state or leave missing chunks.

## 22. Implementation milestones

### Milestone 1 — wx dev server skeleton

- add wx `apply: 'serve'` plugin
- write shell files and no-op HMR files
- make `pnpm dev:sample:wx` start Vite dev and produce openable wx output

### Milestone 2 — runtime + bootstrap

- implement `hmr/runtime.js` module registry
- compile initial app/page source modules into `hmr/bootstrap.js`
- app/page entries load components through logical `hmr.require`

### Milestone 3 — React Refresh runtime

- adapt Vite React Refresh runtime to wx global
- register module exports with logical IDs
- prove editing an existing function component refreshes

### Milestone 4 — update payload

- implement `handleHotUpdate`
- compile changed module factories into `hmr/update.js`
- update only `hmr/update.js` for eligible edits

### Milestone 5 — graph invalidation/new files

- support changed importer + newly added dependency in same update payload
- robust fallback for deletes/topology changes

### Milestone 6 — cleanup and tests

- split code into maintainable modules
- add fixtures/regression checks for barrels, new files, stale update reopen, production no-HMR

## 23. Code quality requirements

- Do not build the implementation around generated chunk file names.
- Do not use regex-only ESM rewriting.
- Keep runtime code generation isolated and snapshot-testable.
- Keep path normalization centralized.
- Make fallback reasons explicit and easy to log.
- Preserve production output behavior.
- Keep `virtual:taro/api` hook-order fix minimal.
- Prefer Vite/Rolldown graph APIs over hand-maintained dependency maps.
