# Alipay Mini Program Support Plan

## Conclusion

Alipay support is feasible, but it is not just another alias. Most of the current WX compiler—module rendering, placement, native asset collection, Tailwind projection, and runtime capsules—is platform-neutral and should become a shared **Mini Program core**. Templates, config conversion, globals, output extensions, project files, and development delivery need platform adapters.

The investigation covered the exact pinned dependency version, `@tarojs/plugin-platform-alipay@4.2.1`. No Alipay Mini Program Studio or `minidev` is installed locally, so runtime behavior still needs an IDE proof phase.

## Required adaptations

| Area | Current assumption | Alipay requirement |
| --- | --- | --- |
| Public target | `VptTarget = 'wx' \| 'h5'` in `src/options.ts` | Add standard target name `'alipay'` |
| Plugin routing | `src/node/vpt.ts` dispatches only WX/H5 | Add Alipay through a shared Mini Program pipeline |
| Taro platform | Hardcoded `plugin-platform-weapp` | Use `plugin-platform-alipay` runtime and `components-react` |
| Compile constants | `TARO_ENV='weapp'` | `TARO_ENV='alipay'`; keep `TARO_PLATFORM='mini'` |
| Native global | WX `global` and `wx` | Alipay’s stable global API object is `my`; do not require `globalObjectMode` |
| Templates | WXML/WXS, `wx:*`, Weapp builder | AXML/SJS, `a:*`, Alipay builder |
| Styles | `app.wxss`, `global.wxss` | `app.acss`, `global.acss` |
| Project files | `project.config.json`, private config, sitemap | `mini.project.json`; also emit Taro’s Alipay `.browserslistrc` workaround |
| App/page config | Emitted unchanged | Apply Taro’s recursive WeChat-to-Alipay key conversion |
| App wrapping | WX recursive `comp` boundaries and slot forwarding | Alipay needs a separate template boundary; existing WX string rewrites cannot be reused |
| Subpackages | `pages: []` code-only packages | Alipay documents `pages` as mandatory; emit a generated anchor page per package |
| Async loading | `require.async()` | Supported by Alipay’s asynchronous subpackage mechanism; validate in Studio |
| Native components | WXML/WXSS folders and WX template registration | Target-specific `.axml`/`.acss` folders, Alipay registration and placeholder rules |
| Development | WX DevTools lifecycle and `wx.connectSocket` | Alipay Studio watcher and `my.connectSocket({ multiple: true })`; WX `devtools` mode is not portable |
| Generator/docs | WX/H5 only | Scripts, config, examples, compatibility tables, and release tests need Alipay |

Taro 4.2.1 recursively renames configuration keys such as:

- `navigationBarTitleText` → `defaultTitle`
- `navigationBarBackgroundColor` → `titleBarColor`
- `enablePullDownRefresh` → `pullRefresh`
- tab-bar `list`, `text`, `iconPath`, `selectedIconPath`, `color`, `custom`
  → `items`, `name`, `icon`, `activeIcon`, `textColor`, `customize`

This conversion must affect both emitted JSON and the configs specialized into App/Page runtime capsules.

## Recommended architecture

Do **not** copy `plugins/wx` into `plugins/alipay`.

### 1. Introduce a shared Mini Program platform model

Create an immutable descriptor containing:

- target and `TARO_ENV`
- runtime/component package IDs
- native global expression (`global` or `my`)
- template/style/script extensions
- project output files
- config transformer
- template adapter
- generated subpackage declaration
- supported development modes

Move genuinely shared code under `plugins/mini` and `runtime/mini`:

- module graph and resolver
- native/CommonJS and SystemJS renderers
- placement planner
- native component asset collection
- style graph/Tailwind processing
- App/Page/component capsules and native shells
- shared development engine and interpreter HMR runtime

Keep only real platform seams under `plugins/wx` and `plugins/alipay`.

### 2. Make options a discriminated union

```ts
type VptOptions = VptWxOptions | VptAlipayOptions | VptH5Options
```

Recommended target-specific fields:

- WX: current `projectConfigJson`, private config, sitemap, and WX HMR modes.
- Alipay: required `miniProjectJson`; interpreter HMR only.
- H5: no irrelevant Mini Program project fields.

Keep `appJson` and page configs in Taro’s canonical WeChat-shaped schema, then translate them for Alipay output. Platform-only settings such as Skyline must be selected by the caller and never emitted into Alipay output.

## Detailed implementation plan

### Phase 0 — Mandatory Alipay Studio proof

Before restructuring production code, create a minimal generated project and verify:

1. CommonJS `App`, `Page`, and `Component` shells execute.
2. SystemJS can be stored on `my`, avoiding inaccessible `global`/`globalThis`.
3. The patched Taro App wrapper broadcasts `app.*` updates correctly through Alipay `getCurrentPages()`.
4. An App wrapper custom component can slot a separate Page renderer component without losing:
   - React context
   - events
   - Page lifecycle
   - granular `page.*` updates
   - global styles
5. `require.async()` loads a generated subpackage.
6. A subpackage with a synthetic anchor page is accepted.
7. A native Alipay component works behind the shared template renderer.
8. Updating imported `global.acss` is observed by Studio.
9. `my.connectSocket({ multiple: true })` can connect to the local Vite socket.

These are release gates, not assumptions. The current machine needs Alipay Mini Program Studio and optionally `minidev` installed for this phase.

### Phase 1 — Extract the shared Mini Program core

Refactor WX production code without changing its emitted bytes:

- Move `module`, `render`, `placer`, `resolve`, `native`, and style graph logic to `plugins/mini`.
- Move common runtime capsules, shells, transport, and SystemJS to `runtime/mini`.
- Replace WX wording and hardcoded errors with the active platform name.
- Parameterize filenames, globals, runtime package IDs, and package declarations.
- Keep WX template output in a dedicated adapter.
- Add golden tests proving WX output remains unchanged.

This prevents Alipay support from creating two compiler implementations.

### Phase 2 — Add the Alipay target and runtime bindings

- Add `@tarojs/plugin-platform-alipay@4.2.1`.
- Route `'alipay'` in `src/node/vpt.ts`.
- Resolve:
  - `@tarojs/components` → Alipay `components-react`
  - platform runtime → Alipay `dist/runtime.js`
- Define `TARO_ENV='alipay'`.
- Specialize the shared SystemJS global to `my`.
- Extend runtime execution tests to verify platform-runtime initialization occurs before framework, React renderer, and application modules.
- Assert production Alipay chunks contain no unresolved browser/WX globals.

The existing patched Taro packages already take their App-view branch for every `TARO_PLATFORM !== 'web'`, but their WX-specific assumptions must be renamed and tested against Alipay. Any implementation change must be made in `patches/*`, followed by `pnpm prepare:taro`.

### Phase 3 — Implement Alipay templates and config output

Use Taro’s Alipay `Template` class, not textual conversion from WXML.

Emit:

- `app.js`, `app.json`, `app.acss`
- `base.axml`, `utils.sjs`
- generated App/Page renderer components
- page `.js`, `.json`, `.axml`, `.acss`
- `mini.project.json`
- `.browserslistrc`

Recommended App-view boundary:

- An outer generated component renders the singleton App compact tree.
- A separate generated Page renderer receives `Page.data.page`.
- The Page AXML slots the Page renderer at the private App outlet.
- Both generated components are virtual hosts with `styleIsolation: 'apply-shared'`.

This avoids importing `base.axml` directly from a Page that uses custom components—a restriction explicitly handled by Taro’s Alipay plugin—and avoids duplicating the entire base template into every Page.

Add pure, immutable Alipay config conversion matching Taro 4.2.1 exactly. Apply it once and feed the same normalized objects to JSON output and runtime capsule specialization.

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
- Use the documented `root`/`pages` manifest shape; omit WX-only `name`.
- Emit a deterministic hidden anchor Page in every generated code package because Alipay documents `pages` as required.
- Keep the current 1.9 MB planning budget until Studio package reports justify another bound.
- Test nested dynamic imports and shared lazy chunks in Studio.

#### Native components

Keep native folders opaque, but make their contract target-specific:

- WX: `.js`, `.json`, `.wxml`, optional `.wxss`
- Alipay: `.js`, `.json`, `.axml`, optional `.acss`

Register components in every generated renderer scope that can instantiate them. Preserve `componentPlaceholder` for cross-package asynchronous components. The default project should use a shared React/Taro counter on Alipay unless an actual Alipay-native example is added.

### Phase 5 — Development workflow and HMR

Generalize the shared DevEngine host, stable filenames, atomic writes, style publication, and React Refresh adaptation.

For Alipay:

- Store SystemJS, Rolldown runtime, and React Refresh hooks on `my`.
- Adapt socket creation to Alipay’s SocketTask contract.
- Use `app.acss` as the full-build identity boundary and update only imported `global.acss` incrementally.
- Print `dist/alipay` as the directory to open in Alipay Mini Program Studio.
- Do not expose WX `devtools` HMR mode.
- Implement interpreter HMR only after the phase-0 WebSocket and state-retention tests pass.
- If the socket proof fails, provide coherent full rebuild development rather than pretending WX HMR semantics work.

### Phase 6 — Fixtures, CI, generator, and documentation

- Extend `loan-genius` to build all three targets.
- Generalize the native-component fixture or add an Alipay-native fixture.
- Add root scripts:
  - `build:loan-genius:alipay`
  - `dev:loan-genius:alipay`
- Add the Alipay build to `.github/workflows/quality.yml`.
- Update `create-vite-taro`:
  - `dev:alipay` and `build:alipay`
  - `VITE_VPT_TARGET` typing
  - target parser
  - target-specific app configuration
  - `mini.project.json` defaults
  - conditional directive examples
- Update README/package descriptions and keywords.
- Add Alipay sections to configuration, quick start, styles, automatic subpackages, native components, HMR, migration, and module-system docs.
- Add Alipay columns to component/API compatibility references rather than implying every Taro API is portable.
- Extend published-package validation to build and inspect `dist/alipay`.

## Completion criteria

Alipay support is complete when:

- typecheck, Biome, and 100% test coverage pass;
- WX output regression tests remain green;
- H5, WX, and Alipay sample builds pass on Windows and Linux;
- Alipay output contains only AXML/ACSS/SJS conventions;
- config translation, dynamic imports, Tailwind, App wrapping, and native components compile in Alipay Studio;
- App and Page React state/lifecycles work through navigation;
- the documented development mode is validated in Studio;
- the packed npm artifacts work without workspace dependencies.

## Primary references

- [Taro 4.2.1 Alipay platform definition](https://github.com/NervJS/taro/blob/v4.2.1/packages/taro-platform-alipay/src/program.ts)
- [Taro 4.2.1 Alipay template implementation](https://github.com/NervJS/taro/blob/v4.2.1/packages/taro-platform-alipay/src/template.ts)
- [Taro’s Alipay native-component template workaround](https://github.com/NervJS/taro/blob/v4.2.1/packages/taro-platform-alipay/src/index.ts)
- [Alipay project configuration](https://miniprogram.alipay.com/docs-alipayconnect/miniprogram_alipayconnect/mpdev/framework_project)
- [Alipay subpackage loading](https://miniprogram.alipay.com/docs-alipayconnect/miniprogram_alipayconnect/mpdev/basic_capabilities_subpackage_loading)
- [Alipay asynchronous subpackages](https://opendocs.alipay.com/mini/057ht3)
