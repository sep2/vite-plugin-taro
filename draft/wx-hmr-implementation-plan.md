# WeChat Mini Program Dev HMR Plan

## Objective

Implement wx dev HMR/Fast Refresh for `vite-plugin-taro` with this contract:

```text
React module implementation changed -> update through dist/wx/hmr/update.js
Mini Program shape changed         -> rewrite affected wx output and let DevTools reload/recompile
```

Production wx builds must not contain HMR runtime, update files, or React Refresh markers.

## Core constraint

Vite web HMR works because the browser can execute updated module URLs. WeChat Mini Program cannot:

- no browser ESM dev-server loader;
- no `eval`;
- no `new Function`;
- no direct use of Vite's browser HMR client.

So wx dev should keep Vite/web HMR semantics for graph, identity, invalidation, and React Refresh, but use a local executable file as the code transport:

```text
dist/wx/hmr/update.js
```

## Dev mode foundation

Use Vite dev-server mode for wx dev, not `vite build --watch`.

Vite's plugin API calls this command `serve` even when users run `vite` or `vite dev`.

Why:

- Vite dev owns the module graph, transforms, invalidation, and React Refresh metadata;
- wx only needs a different execution transport;
- build-watch is full-output oriented and is the wrong model for fine-grained module replacement.

The Mini Program is not a browser client of the dev server. The plugin uses the dev server as a compiler and module-graph backend, then writes wx project files to `dist/wx`.

## Dev output model

Dev wx output should include:

```text
dist/wx/hmr/runtime.js    # stable wx HMR runtime + React Refresh bridge
dist/wx/hmr/bootstrap.js  # initial logical source module factories
dist/wx/hmr/update.js     # overwritten hot-update payload; no-op initially
```

For React implementation edits, only this file should change:

```text
dist/wx/hmr/update.js
```

`app.js`, page entries, common framework/vendor files, and `hmr/bootstrap.js` should stay stable for those edits.

## Logical module identity

React Refresh identity must match Vite/web HMR semantics: source module identity, not generated wx output identity.

Why:

- a component must keep the same family across updates;
- generated wx files are transport/build artifacts;
- cache-busting timestamps or output-file changes must not create new React families.

## HMR files

The dev output uses three HMR files:

```text
hmr/runtime.js    # wx-side HMR/React Refresh runtime
hmr/bootstrap.js  # initial logical source module snapshot
hmr/update.js     # latest executable hot-update payload
```

Keep this split so source identity is independent from wx shell files, and React implementation edits can touch only `hmr/update.js`.

`hmr/update.js` must be safe to leave on disk between DevTools sessions; stale payloads must not run before app/framework setup is ready.

## Hot-update category

A change is eligible for `update.js` when it can be represented as replacing JS/TS/TSX logical module factories without changing Mini Program shell shape.

Examples:

- component render logic;
- local helper code;
- constants used by components;
- hooks inside source modules;
- newly imported JS/TS/TSX modules included in the update payload with the changed importer.

## Full-reload category

Rewrite affected wx output and let DevTools reload/recompile when the change affects Mini Program shape.

Examples:

- app entry semantics;
- page registration or route list;
- app/page JSON config;
- WXML/template structure;
- native/custom component topology;
- framework/vendor bundle structure;
- WXSS/assets until separately supported.

Why:

- WeChat compiles/registers these structures outside React;
- React module replacement is not the right mechanism for project-shape changes.

## Dev project config

Dev wx output should enable:

```json
{
  "setting": {
    "compileHotReLoad": true
  }
}
```

Merge with user project config. Do not force this in production.

## Code organization

Start small:

```text
packages/vite-plugin-taro/src/vite/targets/wx.ts
packages/vite-plugin-taro/src/vite/targets/wx-dev.ts
packages/vite-plugin-taro/src/vite/targets/wx-runtime.ts
```

Intent:

- `wx.ts`: existing wx build/prod config and public integration;
- `wx-dev.ts`: dev-server integration, dev session, change classification, file writing;
- `wx-runtime.ts`: generated runtime/bootstrap/update code.

Split further only when a clear responsibility boundary appears. Do not create a large module tree up front, and do not put the whole feature in `wx.ts`.

## Code quality requirements

- Preserve Vite/web HMR semantics where possible.
- Keep wx transport concerns isolated.
- Keep production path simple and unaffected.
- Make reload reasons explicit in dev logs.
- Preserve ESM import/export semantics when generating module factories.

## Acceptance checks

### First load

A clean wx dev output opens in WeChat DevTools without runtime initialization errors.

### Reopen after hot update

After a hot update, closing and reopening the wx folder still loads normally. Stale `hmr/update.js` must not execute before runtime/app readiness.

### Existing React source edit

Editing an existing React component/source module updates through React Refresh, and only `dist/wx/hmr/update.js` changes.

### New React source module

Adding a new JS/TS/TSX module imported by an existing React source module updates through `hmr/update.js` without requiring a pre-existing generated file for that module.

### Mini Program shape edit

Route/config/template/native topology/CSS/assets changes reload through normal wx output regeneration.

### Production

Production wx output must not contain:

- `hmr/update.js`;
- `hmr/bootstrap.js`;
- wx HMR globals;
- React Refresh globals/markers.

Run normal validation:

```sh
pnpm typecheck
pnpm build:sample:wx
pnpm build:sample:h5
pnpm exec biome check <modified files>
```
