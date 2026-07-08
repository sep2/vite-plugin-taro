# WeChat Mini Program Dev HMR Plan — Intent-First Clean Architecture

This document describes the intended architecture and rationale for wx dev HMR / React Refresh in `vite-plugin-taro`.

It intentionally avoids prescribing low-level implementation mechanics. The next implementation should choose clean internal APIs and file layout based on these principles.

## 1. Goal

Provide WeChat Mini Program development hot updates that feel close to React Refresh on web:

- editing React implementation code should update the running Mini Program without a full reload when React Refresh can safely do so;
- unsupported edits should fall back to normal WeChat reload/recompile behavior instead of crashing or leaving stale generated output;
- production wx output must remain free of dev HMR code.

The feature should prioritize correctness and maintainability over maximizing the number of edit types handled by hot update.

## 2. Non-goals for the first clean implementation

The first clean implementation does not need to solve every kind of dev update.

Out of scope or acceptable as full reload:

- CSS/Tailwind hot updates;
- wx asset updates;
- route/page list changes;
- app/page JSON config changes;
- native/custom component topology changes;
- incompatible React Refresh edits;
- class component state preservation.

These should not block the JS/React architecture.

## 3. Why wx HMR differs from web HMR

Web HMR works because the browser can execute new JavaScript modules by URL. Vite can notify the browser that a module changed, and the browser can import the changed module.

WeChat Mini Program appservice cannot do the same:

- it cannot use normal browser ESM module loading;
- it cannot execute arbitrary code strings with `eval` or `new Function`;
- it cannot directly run Vite's browser HMR client.

Therefore the main difference from web HMR is the code execution transport.

Conceptually:

```text
web: Vite update notice -> browser executes updated module URL
wx:  Vite update notice -> plugin writes executable update file -> DevTools executes changed local file
```

The rest of the system should stay as close to web HMR semantics as practical.

## 4. Core architectural principle

Use Vite/web HMR concepts for identity, invalidation, and React Refresh, but replace the browser module execution mechanism with a WeChat-compatible file-backed transport.

This means:

- Vite should remain the source of truth for module graph and transforms;
- React Refresh identity should be based on source modules, as on web;
- wx should use a stable local update file as the executable carrier;
- fallback reloads should be explicit and intentional.

The implementation should not invent unrelated component-proxy semantics or rely on Mini Program mtime tricks as the primary model.

## 5. Why use real Vite dev server for wx dev

The wx dev mode should be based on Vite's dev-server mode rather than `vite build --watch`.

Reason:

- Vite dev already models the behavior we want: module graph ownership, transform pipeline, invalidation, and React Refresh metadata;
- build-watch is optimized for repeatedly producing full build output, not for fine-grained module replacement;
- using the dev server makes wx HMR conceptually closer to web HMR, with only the execution transport changed.

In Vite plugin terminology the dev-server command is `serve`, even when users run `vite` or `vite dev` from the CLI.

The Mini Program does not become a browser client of the dev server. The dev server is a compiler/graph backend for the plugin.

## 6. Why use a file-backed update transport

WeChat DevTools can observe and execute changed project files. That is the available execution path.

Therefore wx hot updates should be carried through a stable local file:

```text
dist/wx/hmr/update.js
```

This file is not the source of truth for module identity. It is only the executable transport for a set of changed module factories.

A stable update file is preferred because:

- DevTools can notice it;
- it avoids forbidden dynamic code execution;
- it gives the plugin one controlled place to deliver hot payloads;
- it avoids touching app/page shell files for ordinary React implementation edits.

## 7. Logical module identity

Intent: mirror Vite/web HMR semantics.

A React component's refresh identity should be tied to the source module that defines it, not to a generated wx output file.

Examples of intended identities:

```text
/src/app.ts
/src/pages/calculator/index.tsx
/src/components/navigation-bar/navigation-bar.tsx
```

React Refresh family identity should derive from that source module identity plus the component export/local name.

Example:

```text
/src/components/navigation-bar/navigation-bar.tsx NavigationBar
```

Why this matters:

- the same component should keep the same family identity across updates;
- cache-busting timestamps and generated bundle names must not create new React families;
- source identity aligns wx behavior with Vite web behavior;
- it keeps the update transport separate from application semantics.

Generated files such as `app.js`, `common/taro.js`, `hmr/bootstrap.js`, or `hmr/update.js` are transport/build artifacts and should not define React Refresh family identity.

## 8. Runtime files and their purpose

The dev wx output should have three HMR-specific files:

```text
dist/wx/hmr/runtime.js
dist/wx/hmr/bootstrap.js
dist/wx/hmr/update.js
```

Their roles are intentionally separate.

### `runtime.js`

Why it exists:

- wx needs a replacement for the browser's module execution/HMR client;
- React Refresh runtime needs a Mini Program-safe global hook;
- update application, invalidation, and refresh scheduling need one stable owner.

### `bootstrap.js`

Why it exists:

- the initial app must have executable factories for source modules before any hot update occurs;
- app/page shell files should stay small and stable;
- initial module registration should be separated from later hot-update payloads.

### `update.js`

Why it exists:

- it is the file-backed executable transport DevTools can rerun;
- it carries only the latest update payload;
- stale update execution can be guarded during cold start;
- ordinary React implementation edits can avoid touching the wx shell.

## 9. Stable shell contract

The dev output should distinguish between React implementation changes and Mini Program shape changes.

Contract:

```text
React module implementation changed -> write only hmr/update.js
Mini Program shape changed         -> rewrite affected wx output and let DevTools reload/recompile
```

### React module implementation changed

This means the edit can be represented by replacing one or more logical JS/TS/TSX module factories without changing the wx shell.

Examples:

- component render logic;
- local helper code;
- constants used by components;
- hooks inside an existing source module;
- newly imported JS source modules when they can be carried in the update payload.

Why this category should keep the shell stable:

- React Refresh can handle it at the component/module level;
- changing app/page files would cause unnecessary Mini Program reloads;
- stable shell files avoid missing generated files and premature-recompile issues.

### Mini Program shape changed

This means the edit changes something WeChat compiles or registers outside the React runtime.

Examples:

- app entry semantics;
- page registration or route list;
- app/page JSON config;
- WXML/template structure;
- native/custom component topology;
- vendor/framework bundle structure;
- WXSS/assets until separately supported.

Why this category should reload:

- WeChat must recompile or re-register project structure;
- React Refresh cannot safely represent these changes as component factory replacement;
- attempting to keep the shell stable would hide required wx output changes and cause stale runtime state.

## 10. Cold-start and stale-update safety

A stale `hmr/update.js` may exist when the developer reopens the wx output folder.

This matters because DevTools may execute project files during startup before the normal app bootstrap has completed.

The runtime must treat hot payloads as invalid until the app has finished normal registration.

Why:

- a stale update must not initialize source modules before framework/runtime setup;
- it must not cause errors like `Taro.useLaunch is not a function`;
- reopening DevTools should behave like a normal first load, not like applying an old update early.

Cold-start safety is required even if ordinary hot updates work.

## 11. React Refresh integration

The wx HMR runtime should use real React Refresh semantics rather than ad-hoc component proxies.

Why:

- React Refresh already defines when state can be preserved;
- hook signatures and family registration are necessary for correct behavior;
- incompatible updates should remount or reload instead of pretending to preserve state;
- React's reconciler integration is the correct mechanism for updating mounted trees.

Expected behavior:

- function components can preserve state when React Refresh accepts the edit;
- class component state preservation is not required;
- incompatible hook edits may remount or reload;
- mixed exports and non-refresh boundaries may fallback.

## 12. New files and new components

The clean architecture should not make new source files impossible to hot update.

Why:

- web HMR can handle newly imported modules because the browser can execute the new module URL;
- wx cannot execute a new URL, but `update.js` can carry the new module factory;
- logical module identity plus payload factories allows a changed importer and a new dependency to be delivered together.

Preferred behavior:

- adding a new JS/TS/TSX component imported by an existing component should be hot-updateable when the affected graph is otherwise compatible.

Acceptable first implementation fallback:

- full reload for new files if the compiler/invalidation path is not ready yet.

Important requirement:

- the architecture should not depend on pre-generating executable files for every possible future source module.

## 13. `virtual:taro/api` ordering

`virtual:taro/api` should ensure Taro's React runtime has registered its `initNativeApi` hook before `@tarojs/taro` is initialized.

Why:

- lifecycle hooks such as `useLaunch`, `useLoad`, and `useReady` are installed by Taro's React framework runtime;
- HMR introduces new early execution paths;
- relying on incidental module order can produce missing hook methods on cold reopen or stale update execution.

Keep this fix minimal. The goal is ordering correctness, not manually duplicating every hook export.

## 14. Dev project config

Dev wx output should enable WeChat's compile hot reload setting when possible.

Why:

- DevTools is more likely to re-execute changed project files promptly;
- the setting belongs to development output, not production;
- users should not have to remember to configure it manually for this plugin feature.

This must merge with user project config rather than replacing it.

## 15. Template fallback warning

React Refresh/Taro may transiently produce a node that lacks the expected Mini Program template name data.

Observed symptom:

```text
Template `tmpl_0_undefined` not found
```

Preferred outcome:

- fix the source of invalid hydrate/template data if possible.

Acceptable dev-only mitigation:

- add empty fallback templates for missing/undefined names.

Why this must be dev-only:

- production should not include templates that only mask transient HMR states;
- dev warnings should not become production output behavior.

## 16. Fallback philosophy

Fallback is a feature, not a failure.

The implementation should prefer full reload over unsafe hot update when:

- the wx shell shape changed;
- the module graph cannot be analyzed confidently;
- React Refresh boundary validation fails;
- an update would require unsupported runtime semantics;
- a file deletion or dependency change cannot be represented safely.

Why:

- a correct full reload is better than a corrupted hot runtime;
- Mini Program dev stability matters more than preserving state for every edit;
- explicit fallback boundaries make the feature maintainable.

Fallback reasons should be observable in development logs.

## 17. Production boundary

Production wx builds must not contain dev HMR behavior.

Why:

- HMR runtime increases output size;
- React Refresh markers are development-only;
- production should remain deterministic and close to Taro's normal Mini Program output;
- dev-only template fallbacks and update guards should not leak into published output.

Production output should not contain:

- `hmr/update.js`;
- `hmr/bootstrap.js`;
- wx HMR globals;
- React Refresh globals/markers;
- dev-only fallback templates.

## 18. Code quality expectations

The implementation should be small enough to review and refactor incrementally.

Start with a minimal split:

```text
packages/vite-plugin-taro/src/vite/targets/wx.ts
packages/vite-plugin-taro/src/vite/targets/wx-dev.ts
packages/vite-plugin-taro/src/vite/targets/wx-runtime.ts
```

Why:

- `wx.ts` should remain the public integration layer, not a large feature dump;
- generated runtime code should be isolated from Vite plugin wiring;
- dev-session logic should be separable from production wx build config.

Do not pre-create a large module tree. Split further only when a clear responsibility boundary appears.

Code quality priorities:

- preserve web-HMR semantics where possible;
- keep wx-specific transport concerns isolated;
- keep production path simple;
- make fallback decisions explicit;
- avoid regex-only ESM semantics;
- avoid coupling component identity to generated output file names.

## 19. Acceptance criteria

### First load

A clean wx dev output should open in WeChat DevTools without runtime initialization errors.

Important regressions to avoid:

```text
ReferenceError: init_* is not defined
TypeError: Taro.useLaunch is not a function
TypeError: Cannot read property 'useMemo' of undefined
TypeError: require_common_taro.init_dist$1 is not a function
```

### Reopen with stale update

After a hot update, closing and reopening the wx output folder should still load normally.

Why this matters:

- stale `update.js` files are normal in file-backed HMR;
- the system must be robust to DevTools startup order.

### Existing component edit

Editing an existing function component should update through React Refresh when compatible.

Expected file behavior:

```text
only dist/wx/hmr/update.js changes
```

for React implementation edits that do not change Mini Program shape.

### New component file

Adding a new JS/TS/TSX component imported by an existing component should either:

- hot update by carrying the new module in `update.js`; or
- fall back to full reload cleanly.

It must not leave missing generated files or crash the app.

### Unsupported edit

Route/config/template/native topology/CSS/assets may full reload.

They must not be forced through React Refresh.

### Production build

Production wx output should not contain HMR files, HMR globals, React Refresh markers, or dev-only template fallbacks.

## 20. Milestones

### Milestone 1 — dev-server wx output

Purpose: prove wx dev can be driven by Vite's dev server while writing openable Mini Program output.

### Milestone 2 — logical module bootstrap

Purpose: prove app/page shell can load React source through logical module factories.

### Milestone 3 — React Refresh bridge

Purpose: prove component families are registered with stable source identities and React Refresh can update a mounted tree.

### Milestone 4 — update file transport

Purpose: prove an eligible source edit changes only `hmr/update.js` and applies in DevTools.

### Milestone 5 — fallback boundaries

Purpose: prove unsupported edits reload cleanly and never produce missing generated files or stale shell state.

### Milestone 6 — new file support

Purpose: prove the architecture can carry newly added JS modules in update payloads, or cleanly fallback until full support is implemented.

## 21. Summary

The intended architecture is:

```text
Vite dev server owns graph/transforms/React Refresh semantics.
wx runtime owns Mini Program-safe module execution.
hmr/update.js is the executable transport.
logical source IDs define React Refresh identity.
React implementation edits hot update.
Mini Program shape edits reload.
```

This keeps the design close to web HMR while respecting WeChat Mini Program execution constraints.
