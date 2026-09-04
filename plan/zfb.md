# Alipay Mini Program Support Plan

## Conclusion

Alipay support is feasible, but it is not just another alias. Most of the current WX compiler—module rendering, placement, native asset collection, Tailwind projection, and runtime capsules—is platform-neutral and should become a shared **Mini Program core**. Templates, target-native configuration, output extensions, project files, and development delivery need platform adapters.

The implementation and investigation use the exact pinned dependency version, `@tarojs/plugin-platform-alipay@4.2.1`. With Alipay's documented `compileOptions.globalObjectMode: 'enable'` and Taro's `compileOptions.transpile` project setting, the official `minidev` compiler accepts production output, generated asynchronous subpackages, and interpreter-development output; its web simulator renders and accepts interaction with the generated App/Page tree. Shared HMR sequencing is integration-tested against Vite's real WebSocket. Alipay Mini Program Studio is not installed, so native Studio navigation and HMR remain release proofs rather than assumptions.

## Required adaptations

| Area | Current assumption | Alipay requirement |
| --- | --- | --- |
| Public target | `VptTarget = 'wx' \| 'h5'` in `src/options.ts` | Add the existing public target name `'zfb'`; reserve `'alipay'` for `TARO_ENV` |
| Plugin routing | `src/node/vpt.ts` dispatches only WX/H5 | Add Alipay through a shared Mini Program pipeline |
| Taro platform | Hardcoded `plugin-platform-weapp` | Use `plugin-platform-alipay` runtime and `components-react` |
| Compile constants | `TARO_ENV='weapp'` | `TARO_ENV='alipay'`; keep `TARO_PLATFORM='mini'` |
| Runtime and API globals | WX exposes the platform `global`; platform APIs use `wx` | Enable `compileOptions.globalObjectMode` for upstream Taro, keep VPT runtime state on standard `globalThis`, and use `my` only for Alipay APIs |
| JavaScript transpilation | WX consumes Vite's ES2018 output directly | Follow Taro's Alipay setup: emit its `.browserslistrc` and enable `compileOptions.transpile` in `mini.project.json`, leaving syntax conversion to the Alipay developer tool |
| Templates | WXML/WXS, `wx:*`, Weapp builder | AXML/SJS, `a:*`, Alipay builder |
| Styles | `app.wxss`, `global.wxss` | `app.acss`, `global.acss` |
| Project files | `project.config.json`, private config, sitemap | `mini.project.json`; also emit Taro’s Alipay `.browserslistrc` workaround |
| App/page config | User supplies Taro/WeChat fields | User supplies Alipay fields directly in `vite.config.ts`; vpt performs no cross-platform key conversion |
| App wrapping | WX recursive `comp` boundaries and slot forwarding | Alipay passes independent `app` and `page` roots into one recursive `comp`; every named-template edge forwards the Page root to the outlet |
| Subpackages | `pages: []` code-only packages | Keep `pages: []`; Alipay documents the field as mandatory and the official compiler accepts the empty array for asynchronous code packages |
| Async loading | `require.async()` | Supported by Alipay’s asynchronous subpackage mechanism; validate in Studio |
| Native components | WXML/WXSS folders and WX template registration | Target-specific `.axml`/`.acss` folders, Alipay registration and placeholder rules |
| Development | WX DevTools lifecycle and `wx.connectSocket` | Reuse the shared DevTools/interpreter mechanics through thin target entries; Alipay negotiates Vite's protocol with `my.connectSocket({ multiple: true, protocols: ['vite-hmr'] })` |
| Generator/docs | WX/H5 only | Scripts, config, examples, compatibility tables, and release tests need Alipay |

Multi-target Vite configuration must select the native keys explicitly. For example, WX uses `navigationBarTitleText`, while ZFB uses `defaultTitle`; WX tab bars use `list`, while ZFB uses `items`. The selected object is shared unchanged between emitted JSON and App/Page runtime-capsule specialization.

## Recommended architecture

Do **not** copy `plugins/wx` into `plugins/alipay`.

### 1. Introduce a shared Mini Program platform model

Create an immutable `MiniContract` containing only values consumed by shared Mini:

- the user-supplied target options
- `TARO_ENV`, component binding, and platform runtime ID
- the complete physical runtime module IDs
- App/global style filenames
- one `output.generateProjectSkeleton(...)` operation

The skeleton operation receives the final Rolldown bundle, native-component registrations, generated package roots, and JSON mode,
then returns the target's complete native asset list. WX and ZFB own separate skeleton generators; shared pure configuration,
registration, formatting, and path helpers live under `plugins/mini/skeleton`. Each adapter lists its complete runtime module table;
repeating shared paths is simpler than introducing another composition layer. The core owns the common 1.9 MB package-planning budget.

Move genuinely shared code under `plugins/mini` and `runtime/mini`:

- module graph and resolver
- native/CommonJS and SystemJS renderers
- placement planner
- native component asset collection
- style graph/Tailwind processing
- App/Page/component capsules and native shells
- shared development engine and interpreter HMR runtime

Keep only real platform seams under `plugins/wx` and `plugins/zfb`.

### 2. Keep one public options contract

Keep `VptOptions` as the single public options type. Target adapters consume the relevant values and construct a private `MiniContract`; do not expose parallel WX, ZFB, or H5 option types.

Keep `appJson` and page configs in the selected target's native schema. Multi-target Vite configuration chooses WX/H5 or ZFB objects explicitly; platform-only settings such as Skyline must never be emitted into Alipay output.

## Detailed implementation plan

### Phase 0 — Runtime evidence and remaining Studio proofs

The current implementation has established these executable facts:

1. CommonJS `App`, `Page`, and `Component` shells compile and execute in the `minidev` web simulator.
2. With `globalObjectMode` enabled, upstream Taro can read the platform `global`; SystemJS and Rolldown's development runtime install on standard `globalThis`.
3. Independent `app` and `page` roots render through one recursive `comp`; form interaction reaches React state.
4. With `mini.project.json` transpilation enabled, the official compiler accepts an automatically generated asynchronous code subpackage declared with `pages: []` and no VPT-owned JavaScript recompilation stage.
5. The same asynchronous-package build accepts a copied Alipay native component using `styleIsolation: 'apply-shared'`.
6. `my.connectSocket({ multiple: true, protocols: ['vite-hmr'] })` negotiates the Vite protocol and opens a local socket.
7. Vite's real WebSocket publishes interpreter patches for source edits, and shared runtime sequencing/application is integration-tested.

The remaining release proofs require Alipay Mini Program Studio: navigation across retained Pages, runtime `require.async()` loading on a device-class engine, an Alipay-native component, ACSS hot replacement, and end-to-end inbound SocketTask HMR. `minidev`'s web shim opens and sends through SocketTask but does not dispatch inbound `onMessage` callbacks even against a standalone echo server, so it cannot substitute for that Studio HMR gate.

### Phase 1 — Extract the shared Mini Program core

Refactor WX production code without changing its emitted bytes:

- Move `module`, `render`, `placer`, `resolve`, `native`, and style graph logic to `plugins/mini`.
- Move common runtime capsules, shells, transport, and SystemJS to `runtime/mini`.
- Neutralize shared wording while retaining any byte-sensitive WX production diagnostics.
- Parameterize physical runtime IDs, target-owned filenames, Taro bindings, and project-skeleton generation.
- Keep WX template output in a dedicated adapter.
- Add golden tests proving WX output remains unchanged.

This prevents Alipay support from creating two compiler implementations.

### Phase 2 — Add the Alipay target and runtime bindings

- Add `@tarojs/plugin-platform-alipay@4.2.1`.
- Route `'zfb'` in `src/node/vpt.ts` while defining `TARO_ENV='alipay'`.
- Resolve:
  - `@tarojs/components` → Alipay `components-react`
  - platform runtime → Alipay `dist/runtime.js`
- Define `TARO_ENV='alipay'`.
- Enable Alipay's format-2 `compileOptions.globalObjectMode` for upstream Taro while keeping shared SystemJS/runtime state on standard `globalThis`; reserve `my` for platform API calls.
- Extend runtime execution tests to verify platform-runtime initialization occurs before framework, React renderer, and application modules.
- Assert production Alipay chunks contain no unresolved browser/WX globals.
- Keep Vite's shared ES2018 output instead of adding a ZFB-only JavaScript recompiler. Taro 4 emits
  `defaults and fully supports es6-module` in `.browserslistrc` and relies on Alipay's documented `mini.project.json`
  `compileOptions.transpile` stage for the final developer-tool conversion. The default project and sample must enable that setting
  together with `compileOptions.globalObjectMode: 'enable'`;
  the compiler contract needs no JavaScript-dialect field or callback.

The existing patched Taro packages already take their App-view branch for every `TARO_PLATFORM !== 'web'`, but their WX-specific assumptions must be renamed and tested against Alipay. Any implementation change must be made in `patches/*`, followed by `pnpm prepare:taro`.

### Phase 3 — Implement Alipay templates and config output

Use Taro’s Alipay `Template` class, not textual conversion from WXML.

Emit:

- `app.js`, `app.json`, `app.acss`
- `base.axml`, `utils.sjs`
- the generated recursive `comp` and `custom-wrapper` components
- page `.js`, `.json`, `.axml`, `.acss`
- `mini.project.json`
- `.browserslistrc`

App-view boundary:

- The generated `comp` component receives the singleton App compact tree as `i` and the caller-owned `Page.data.page` root as `p`.
- Alipay named templates receive explicit data scopes, so each App recursion edge forwards `p` unchanged.
- The private outlet invokes `taro_tmpl(root: p)` at the exact in-memory Page position.
- `comp` remains a virtual host with `styleIsolation: 'apply-shared'`; no Page-renderer component is generated.

Every generated Page registers `comp`, so follow Taro 4.2.1's Alipay restriction by removing the Page's `base.axml` import. The
Page needs no copied template table: `comp.axml` legally imports the shared table and renders both roots. This also avoids relying
on a default slot through imported named-template wrappers, whose fresh template scopes do not retain the outer slot collection.

Pass the user-supplied Alipay configuration fields unchanged to both JSON output and runtime-capsule specialization. Target selection belongs in `vite.config.ts`, not in an implicit compiler translation layer.

### Phase 4 — Styles, subpackages, and native components

#### Styles

Generalize the existing style plugin:

- platform-specific `app.*` and `assets/global.*` names
- Alipay ACSS output
- platform-aware `@weapp-tailwindcss/postcss` settings
- matching JavaScript class escaping
- production and development output from the same style projection

Add ACSS tests for Tailwind v4 output, CSS Modules, `rpx`, pseudo-selectors, global cascade order, and style isolation.

#### Automatic subpackages

For Alipay:

- Keep the existing graph partitioner and `require.async()` transport.
- Let the ZFB skeleton emit the documented `root`/`pages` manifest shape while omitting WX-only `name`.
- Emit the required `pages` field as an empty array for generated code-only packages; official `minidev@2.2.5` compilation confirms that no synthetic route is required.
- Keep the current 1.9 MB planning budget until Studio package reports justify another bound.
- Test nested dynamic imports and shared lazy chunks in Studio.

#### Native components

Keep native folders opaque, but make their contract target-specific:

- WX: `.js`, `.json`, `.wxml`, optional `.wxss`
- Alipay: `.js`, `.json`, `.axml`, optional `.acss`; the current compiler accepts `styleIsolation: 'apply-shared'` or `shared`

Register components in every generated renderer scope that can instantiate them. Preserve `componentPlaceholder` for cross-package asynchronous components. The default project should use a shared React/Taro counter on Alipay unless an actual Alipay-native example is added.

### Phase 5 — Development workflow and HMR

Generalize the shared DevEngine host, stable filenames, atomic writes, style publication, and React Refresh adaptation.

For ZFB:

- Keep the existing flat `devtoolsHmrRuntime` and `interpreterHmrRuntime` module paths as the platform seam; do not add a capability model or contract callbacks.
- Move graph propagation, patch sequencing, DevTools Page re-registration, and interpreter execution into `runtime/mini`.
- Keep thin WX and ZFB mode entries that install the shared runtime directly on `globalThis`; only their `wx`/`my` socket calls differ.
- Inject only one function into the shared runtime: `(endpoint: string) => MiniSocketTask`.
- WX opens it with `wx.connectSocket({ url, protocols: ['vite-hmr'] })`; ZFB opens it with `my.connectSocket({ url, multiple: true, protocols: ['vite-hmr'] })`.
- Use `app.acss` as the full-build identity boundary and update only imported `global.acss` incrementally.
- Print `dist/zfb` as the directory to open in Alipay Mini Program Studio.

### Phase 6 — Fixtures, CI, generator, and documentation

- Extend `loan-genius` to build all three targets.
- Generalize the native-component fixture or add an Alipay-native fixture.
- Add root scripts:
  - `build:loan-genius:zfb`
  - `dev:loan-genius:zfb`
- Add the Alipay build to `.github/workflows/quality.yml`.
- Update `create-vite-taro`:
  - `dev:zfb` and `build:zfb`
  - `VITE_VPT_TARGET` typing
  - target parser
  - target-specific app configuration
  - `mini.project.json` defaults
  - conditional directive examples
- Update README/package descriptions and keywords.
- Add Alipay sections to configuration, quick start, styles, automatic subpackages, native components, HMR, migration, and module-system docs.
- Add Alipay columns to component/API compatibility references rather than implying every Taro API is portable.
- Extend published-package validation to build and inspect `dist/zfb`.

## Completion criteria

Alipay support is complete when:

- typecheck, Biome, and 100% test coverage pass;
- WX output regression tests remain green;
- H5, WX, and Alipay sample builds pass on Windows and Linux;
- Alipay output contains only AXML/ACSS/SJS conventions;
- target-native config, dynamic imports, Tailwind, App wrapping, and native components compile in Alipay Studio;
- App and Page React state/lifecycles work through navigation;
- the documented development mode is validated in Studio;
- the packed npm artifacts work without workspace dependencies.

## Primary references

- [Taro 4.2.1 Alipay platform definition](https://github.com/NervJS/taro/blob/v4.2.1/packages/taro-platform-alipay/src/program.ts)
- [Taro 4.2.1 Alipay template implementation](https://github.com/NervJS/taro/blob/v4.2.1/packages/taro-platform-alipay/src/template.ts)
- [Taro’s Alipay native-component template workaround](https://github.com/NervJS/taro/blob/v4.2.1/packages/taro-platform-alipay/src/index.ts)
- [Alipay project configuration, `globalObjectMode`, and `transpile`](https://opendocs.alipay.com/mini/03dbc3)
- [Alipay subpackage loading](https://miniprogram.alipay.com/docs-alipayconnect/miniprogram_alipayconnect/mpdev/basic_capabilities_subpackage_loading)
- [Alipay asynchronous subpackages](https://opendocs.alipay.com/mini/057ht3)
- [Alipay `my.connectSocket`](https://opendocs.alipay.com/mini/038mkg)
- [Alipay development HMR](https://opendocs.alipay.com/mini/02q2a0)
