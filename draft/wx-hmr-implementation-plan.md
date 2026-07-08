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

Examples:

```text
/src/app.ts
/src/pages/calculator/index.tsx
/src/components/navigation-bar/navigation-bar.tsx
```

Example family identity:

```text
/src/components/navigation-bar/navigation-bar.tsx NavigationBar
```

Why:

- the same component should keep the same family across updates;
- generated files are transport/build artifacts;
- cache-busting timestamps or output-file changes must not create new React families.

## Runtime responsibilities

`hmr/runtime.js` should own wx-side HMR execution:

- register initial and updated logical module factories;
- provide a Mini Program-safe module loader;
- track dependency relationships for invalidation and re-execution;
- install/adapt React Refresh for the Mini Program global object;
- guard stale update payloads during cold start.

Use real React Refresh semantics. Do not implement component proxy replacement as a substitute.

## Bootstrap responsibilities

`hmr/bootstrap.js` should register initial logical source module factories.

Why:

- app/page shell files stay small and stable;
- initial source execution is separated from later hot-update payloads;
- the same logical IDs can be reused by `hmr/update.js`.

## Update payload responsibilities

`hmr/update.js` should carry changed module factories and ask the runtime to apply them.

Why:

- DevTools can execute changed local files;
- wx cannot execute JS received as text over a socket;
- one stable update file avoids touching shell files for ordinary React edits.

A stale `update.js` must not run during cold start before app/framework setup is ready.

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

## Taro API ordering requirement

`virtual:taro/api` should ensure Taro's React runtime registers its `initNativeApi` hook before `@tarojs/taro` initializes.

Why:

- hooks such as `useLaunch`, `useLoad`, and `useReady` are installed by Taro's React framework runtime;
- HMR creates earlier execution paths than normal app bootstrap;
- relying on incidental module order can cause `Taro.useLaunch is not a function` on cold reopen or stale update execution.

Keep this fix minimal. Do not manually duplicate every lifecycle hook.

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
- Do not use regex-only ESM semantics for module factory generation.
- Do not base React Refresh identity on generated wx output file names.

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
