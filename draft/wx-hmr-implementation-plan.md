# WeChat Mini Program Dev HMR Plan

## Goal

Implement wx dev HMR/Fast Refresh for `vite-plugin-taro` with one clear contract:

```text
Application JS/TS source changed -> update through dist/wx/hmr/update.js
Mini Program shape changed       -> regenerate wx output and let DevTools reload/recompile
```

Production wx builds must not contain HMR files, HMR globals, or React Refresh markers.

## Constraint

Vite web HMR relies on the browser being able to execute updated module URLs. WeChat Mini Program cannot do that:

- no browser ESM dev-server loader;
- no `eval`;
- no `new Function`;
- no direct use of Vite's browser HMR client.

So the wx implementation should keep Vite/web HMR semantics for module graph, source identity, invalidation, and React Refresh, but use a local executable file as the transport:

```text
dist/wx/hmr/update.js
```

## Dev-server model

Use Vite dev-server mode for wx dev instead of `vite build --watch`.

In Vite's plugin API this is `command === 'serve'`, even when the user runs `vite` or `vite dev`.

Why:

- Vite dev already owns transforms, module graph, invalidation, and React Refresh metadata;
- wx only needs a different execution transport;
- build-watch is full-output oriented and is the wrong model for fine-grained module replacement.

The Mini Program is not a browser client of the dev server. The plugin uses Vite dev as a compiler/module-graph backend and writes wx project files to `dist/wx`.

## Dev output contract

Dev wx output must include one stable executable update payload:

```text
dist/wx/hmr/update.js     # latest executable update payload; no-op initially
```

A Mini Program dev runtime and the initial logical source module snapshot must be available before app/page code executes. They may be embedded in shell files or emitted as stable generated artifacts. The plan does not require separate runtime/bootstrap files.

For application JS/TS/TSX edits that do not change Mini Program shape, only this file should change:

```text
dist/wx/hmr/update.js
```

The wx shell, framework/vendor files, and initial source snapshot artifacts should stay stable for those edits.

`hmr/update.js` must also be safe to leave on disk between DevTools sessions. A stale update payload must not run before app/framework setup is ready.

## Module identity

React Refresh identity must follow Vite/web HMR semantics: source module identity, not generated wx output identity.

Why:

- a component must keep the same family across updates;
- generated wx files are transport/build artifacts;
- cache-busting timestamps or output-file changes must not create new React families.

The same logical source identity should be used by the initial snapshot and later update payloads.

## Hot-update scope

A source change belongs on the `update.js` path when it can be represented as replacing logical JS/TS/TSX module factories without changing Mini Program shape.

This includes application source such as:

- React component implementation;
- hooks;
- utility modules;
- constants;
- helper functions;
- newly imported application JS/TS/TSX modules included with the changed importer.

All eligible source edits should be delivered through `hmr/update.js`.

## Reload scope

A change should regenerate wx output and let DevTools reload/recompile when it changes Mini Program shape.

This includes:

- app entry semantics;
- page registration or route list;
- app/page JSON config;
- WXML/template structure;
- native/custom component topology;
- framework/vendor bundle structure;
- WXSS/assets until separately supported.

Why:

- WeChat compiles/registers these structures outside React;
- source module replacement is not the right mechanism for project-shape changes.

## Dev project config

Dev wx output should enable WeChat compile hot reload:

```json
{
  "setting": {
    "compileHotReLoad": true
  }
}
```

Merge with user project config. Do not force this in production.

## Code organization

Keep the dev HMR plugin target-agnostic enough for future Mini Program targets.

Start with this split:

```text
packages/vite-plugin-taro/src/vite/targets/wx.ts
packages/vite-plugin-taro/src/vite/hmr.ts
packages/vite-plugin-taro/src/shim/dev-runtime.ts
```

Intent:

- `targets/wx.ts`: wx build/prod config and wx-specific shell/output details;
- `vite/hmr.ts`: dev-server HMR integration, dev session, change classification, and update writing;
- `shim/dev-runtime.ts`: static Mini Program dev runtime source controlled by `vite/hmr.ts`; it may be embedded or emitted as a stable artifact.

The HMR plugin should not be buried under `vite/targets/wx/` because the same dev-server/update-file model can later serve other Mini Program targets. Keep target-specific behavior behind small target adapters instead.

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

After a hot update, closing and reopening the wx folder still loads normally. Stale `hmr/update.js` does not execute before runtime/app readiness.

### Application source edit

Editing application JS/TS/TSX source updates through the wx HMR runtime. Only `dist/wx/hmr/update.js` changes.

### Mini Program shape edit

Route/config/template/native topology/CSS/assets changes reload through normal wx output regeneration.

### Production

Production wx output must not contain:

- `hmr/update.js`;
- wx HMR globals;
- React Refresh globals/markers.
