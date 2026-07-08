# WeChat Mini Program Dev HMR Plan

## Goal

Implement wx dev HMR/Fast Refresh for `vite-plugin-taro` with one clear contract:

```text
Application JS/TS source changed -> update through executable HMR payload file(s)
Mini Program shape changed       -> regenerate wx output and let DevTools reload/recompile
```

Production wx builds must not contain HMR payload files, HMR globals, or React Refresh markers.

## Constraint

Vite web HMR relies on the browser being able to execute updated module URLs. WeChat Mini Program cannot do that:

- no browser ESM dev-server loader;
- no `eval`;
- no `new Function`;
- no direct use of Vite's browser HMR client.

So the wx implementation should keep Vite/web HMR semantics for module graph, source identity, invalidation, and React Refresh, but use changed local JS files as the execution transport.

## Dev-server model

Use Vite dev-server mode for wx dev instead of `vite build --watch`.

In Vite's plugin API this is `command === 'serve'`, even when the user runs `vite` or `vite dev`.

Why:

- Vite dev already owns transforms, module graph, invalidation, and React Refresh metadata;
- wx only needs a different execution transport;
- build-watch is full-output oriented and is the wrong model for fine-grained module replacement.

The Mini Program is not a browser client of the dev server. The plugin uses Vite dev as a compiler/module-graph backend and writes wx project files to `dist/wx`.

## Dev output contract

Dev wx output must include executable HMR payload file(s) that are dependencies of the app/page code that should receive updates.

Payload placement is a transport choice. It may be global, page-local, app-local, or a mix. For example, page-local payload files can align better with WeChat's page dependency model, while shared/global payloads can simplify app-wide or shared-module updates.

Payload file location must not define source module identity.

For application JS/TS/TSX edits that do not change Mini Program shape, only the relevant HMR payload file(s) should change. The wx shell and framework/vendor files should stay stable for those edits.

Existing payload files must be safe to leave on disk between DevTools sessions. On reopen, they should provide the current source payload for first load and must not apply as premature hot updates before app/framework setup is ready.

## Module identity

React Refresh identity must follow Vite/web HMR semantics: source module identity, not generated wx output identity.

Why:

- a component must keep the same family across updates;
- generated wx files are transport/build artifacts;
- cache-busting timestamps or output-file changes must not create new React families.

The same logical source identity should be used on first load and later updates, regardless of which payload file carries the code.

## Hot-update scope

A source change belongs on the HMR payload path when it can be represented as replacing logical JS/TS/TSX module factories without changing Mini Program shape.

This includes application source such as:

- React component implementation;
- hooks;
- utility modules;
- constants;
- helper functions;
- newly imported application JS/TS/TSX modules included with the changed importer.

All eligible source edits should be delivered through executable HMR payload file(s).

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
- `vite/hmr.ts`: dev-server HMR integration, dev session, change classification, and payload writing;
- `shim/dev-runtime.ts`: static Mini Program dev runtime source controlled by `vite/hmr.ts`.

The HMR plugin should not be buried under `vite/targets/wx/` because the same dev-server/local-payload model can later serve other Mini Program targets. Keep target-specific behavior behind small target adapters instead.

Split further only when a clear responsibility boundary appears. Do not create a large module tree up front, and do not put the whole feature in `wx.ts`.

## Code quality requirements

- Preserve Vite/web HMR semantics where possible.
- Keep Mini Program transport concerns isolated.
- Keep production path simple and unaffected.
- Make reload reasons explicit in dev logs.
- Preserve ESM import/export semantics when generating module factories.

## Acceptance checks

### First load

A clean wx dev output opens in WeChat DevTools without runtime initialization errors.

### Reopen after hot update

After a hot update, closing and reopening the wx folder still loads normally. Existing HMR payload files do not apply as hot updates before runtime/app readiness.

### Application source edit

Editing application JS/TS/TSX source updates through the wx HMR runtime. Only relevant HMR payload file(s) change.

### Mini Program shape edit

Route/config/template/native topology/CSS/assets changes reload through normal wx output regeneration.

### Production

Production wx output must not contain:

- HMR payload files;
- wx HMR globals;
- React Refresh globals/markers.
