# Dependency patch series

pnpm applies one combined patch to each package version. We maintain **10 feature patches across 5 packages**, with explicit application order in [`series.json`](./series.json). The files in `series/` are authoritative; `generated/` is reproducible installation output.

## Feature inventory

| Package | Ordered feature patches | Purpose |
| --- | --- | --- |
| `@tarojs/plugin-html@4.2.1` | `01-html-display-defaults` | Populate upstream HTML inline/block element sets without the Taro compiler rewriting installed files. |
| `@tarojs/plugin-framework-react@4.2.1` | `01-react19-root-api` | Use React 19 concurrent roots for App and standalone native-component entries; make standalone native-component setup explicitly synchronous with `flushSync`. |
| | `02-mini-app-page-rendering` | Keep one React App tree, broadcast App data to native Pages, project Page children through an outlet, and seed App/Page data in the same initial native batch. |
| | `03-h5-router-container` | Give H5 Page children a dedicated `taro_router` container so routing CSS does not target unrelated App siblings. |
| | `04-page-prerender` | Deduplicate queued and rendered Page identities for caller-controlled prerendering. Preserve the original queue, render/unmount flow, mount signature and native update scheduling. |
| `@tarojs/react@4.2.1` | `01-react19-reconciler` | Target the pinned React 19 reconciler contract directly: concurrent roots, commit updates, scoped event priorities, error callbacks and distinct synchronous callback/work flushing. Remove legacy render APIs and align declarations. |
| | `02-app-page-outlet-projection` | Mark the outlet's ancestor branch after each React commit so recursive native components forward the Page slot exactly once. |
| `@tarojs/runtime@4.2.1` | `01-mini-app-page-rendering` | Make the App host a scheduler, separate `app.*` and `page.*` updates, and keep Page roots out of App serialization. These changes form one coordinated feature, not independent per-file patches. |
| | `02-page-prerender` | Type native Page data as an object or factory and let onLoad adopt a caller-prepared identity without moving lifecycle dispatch. VPT stores that identity in non-enumerable `__vpt_meta.prerenderIdentity`; the factory signature is unchanged. |
| `canvas-confetti@1.9.4` | `01-canvas-confetti-enhancements` | Keep all existing confetti enhancements together: rotation/tilt controls, frame-clock repeat emission, cached path drawing, and DOMMatrix input normalization. Source, browser and module builds stay aligned. |

React 19 support spans the renderer and framework packages. The renderer targets `react-reconciler@0.34.0` and React 19.3, without legacy roots, React 18 host signatures or API probing. `render` and `findDOMNode` are no longer exported; callers use `createRoot` and refs. The internal `unmountComponentAtNode` host-lookup helper remains, but only tears down concurrent roots. Public `flushSync` runs callbacks through `flushSyncFromReconciler`; controlled-input restoration calls `flushSyncWork` before restoring native values. Neither operation waits for native `setData` completion.

Mini App/Page rendering spans the runtime, renderer and framework packages; their corresponding patches must stay coordinated. The series are maintenance boundaries, **not independently selectable runtime features**.

The original feature split preserved the previous patched package bytes; the React-19-only adaptation now simplifies that renderer contract. Once the App is ready, opted-in WX glass-easel Pages render synchronously inside the native data factory with either Skyline or WebView; existing native onLoad reuses their hosts and dispatches business hooks at the usual point. Other Page mounts and native setData scheduling retain their ordinary asynchronous behavior. No attached hook or synthetic lifecycle delivery participates. Only upstream Taro's standalone/mixed-mode component bootstrap now explicitly flushes its initial React commit: the pinned reconciler already ignored its old legacy-root request, so that path previously had no synchronous-commit guarantee. VPT's generated App/Page entries do not call that standalone bootstrap.

## Page prerender contract

Routes opt into the native Page data factory through `pages[].prerender: true`. Omission or `false` registers the original config directly, without a data factory or prerendering. Registration does not branch on the target; factory execution depends on native host support (glass-easel on WX). VPT initializes query capture before the App/Page capsules, installing one `wx.onBeforePageLoad` listener when the host provides that API (base library 3.5.5+) and otherwise doing nothing. No navigation API is replaced: there is no URL parser, loader map, navigation queue, speculative tree or cancellation protocol.

The native `Page({ data: () => ... })` factory initializes the existing global router. Object-form registration preserves DevTools Page-script hot delivery; the chaining API does not re-execute these scripts on edits. VPT wraps the ordinary App `mount()` call in `flushSync`, then serializes App/Page hosts with Taro's existing serializer. Taro's mount implementation and signature remain unchanged. A cold App is not forced to render: until its wrapper is ready, mounting follows the existing asynchronous path and the data factory returns the ordinary seed. Native onLoad adopts the instance identity and reuses its element; lifecycle dispatch and native context binding remain where they were. The upstream Taro factory still returns its ordinary object-valued seed; its `PageInstance.data` declaration now also accepts a native data factory. VPT's `runtime/mini/capsule/create-vpt-page-config.ts` chooses the final native data form on that same config: without prerender it retains the data object; with prerender it replaces `data` with a factory that captures the component, route and seed and calls `prerenderToData(config, component, routePath, initialData)`. Non-enumerable `__vpt_meta` contains only the one-shot `prerenderIdentity`, so the original onLoad consumes the identity written by prerendering without a config copy. The Page capsule only calls `createVptPageConfig(PageComponent, __VPT_PAGE_OPTIONS__)` and exports its result; the factory owns the seed, while one placeholder supplies the route's `VptPageOption`; the native shell only calls `Page(pageConfig)`. There are no platform constructor adapters, constructor contract fields, wrapper return objects, WeakMaps or initializer callbacks. `bootstrap.ts` is the single runtime entry: it initializes SystemJS, polyfills, transport and native query capture, and exports the loader and query getter without a separate facade. The query listener is installed before the capsules load; prerendering stays in the capsule runtime rather than VPT's native exports. The Taro patch keeps the original factory signature: native onLoad reads and clears `config.__vpt_meta.prerenderIdentity` once, then follows its normal lifecycle path. Ordinary Taro configs without VPT metadata retain their normal initialization. No identity-reader callback is passed to the factory. WX glass-easel retains native Page instances during hot registration without invoking their data factory or replaying lifecycles. The shared HMR helper tracks native instances through ordinary lifecycle wrappers and detects glass-easel by its instance-level `groupUpdates` method. Hot registration of those Pages leaves the lifecycle gate and data factory untouched: no lifecycle suppression, native snapshot copying, or deferred cleanup participates. Pages without that capability retain their existing lifecycle gate and snapshot handoff, replacing `config.data` with the native snapshot rather than invoking a factory. No separate prerender-suppression flag is needed; selection is per mounted Page, not per target or App configuration. Only the shared Page shell is transformed: HMR prepares the exported config immediately before native registration, preserving its data factory on glass-easel. No Activity, renderer observer, timer, snapshot cache, second React root or new router context participates. Both modes of `useRouter` remain upstream behavior.

A committed Suspense fallback is valid initial content. If the Page suspends without a committed fallback, the factory returns the ordinary seed and onLoad mounting finishes when content becomes available. The starter template sets `glassEaselWebview: true` at the top level of App JSON alongside `componentFramework` (not under `window`) and explicitly sets `pages[].config.glassEaselWebview: true` on every WX Page. This includes ordinary WebView Pages, Skyline fallback, and Pages without prerendering. The repository's WebView DevTools fixture with base library 3.17.2 required the Page flag even with the App flag enabled; WebView glass-easel support starts at 3.8.12. WX now requires glass-easel; there is no exparser fallback. Existing projects must retain the App-level `componentFramework: 'glass-easel'` and `glassEaselWebview: true` settings and add the Page flag to every WX route; the plugin does not inject these Page settings. Other targets do not need this WX-specific flag.

Refs, layout/passive effects and class mount callbacks may run during the synchronous data callback before native onLoad. `Current.router` describes the incoming route while `Current.page` is not yet bound to the new native instance; destination-native work belongs in real load callbacks. Native navigation failures before instance creation perform no React mount. Cold entry, direct native navigation and Taro navigation share this creation path. Retained tabs are not recreated.

Mount deduplication is O(Q + P) for Q queued and P rendered Pages; unmount retains upstream O(P) behavior. Initial serialization is O(A + N) for the App and destination Page hosts, in addition to React rendering cost. Native bridge updates retain Taro's existing mutation queue and asynchronous scheduler; no extra full `page.cn` payload is added.

## Compose and install

After the initial `pnpm install`, run:

```sh
pnpm patches:build
pnpm install
pnpm prepare:taro
pnpm build:plugin
```

To work on one package:

```sh
pnpm patches:build @tarojs/runtime@4.2.1
```

The composer:

1. Uses `pnpm patch --ignore-existing` to extract the pristine version into a temporary directory, reusing pnpm's package cache.
2. Records the upstream tree in a temporary Git index; no commits or Git identity are required.
3. Applies each feature with `git apply --index`, in manifest order. Conflicts fail immediately.
4. Generates one upstream-relative diff, including additions, deletions and binary changes, with deterministic Git diff settings.
5. Removes temporary package trees. Only after every selected series succeeds does build mode write the combined patches.

It deliberately does not call `pnpm patch-commit`: pnpm registration is already declared in `pnpm-workspace.yaml`, and composition must not reinstall dependencies or rewrite that configuration. `pnpm install` refreshes the lockfile after generated patch contents change. Like ordinary `pnpm patch`, extraction records ignored patch-session bookkeeping under `node_modules`.

Commit the feature patches, generated patches, manifest/configuration changes and refreshed lockfile together. Normal installs and CI consume the committed combined files. There is **no install hook**, no second patch pass over `node_modules`, and no manual editing of runtime build output.

## Edit or add a feature

A feature diff is relative to upstream **plus all preceding features**, not to the final installed package. Do not concatenate diffs or generate a feature from an already fully patched dependency.

For example, editing the runtime's first feature (Bash example; use an absolute temporary path outside the repository):

```sh
repo="$PWD"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
pnpm patch @tarojs/runtime@4.2.1 --ignore-existing --edit-dir "$work/package"
git -C "$work/package" init --quiet --object-format=sha1
git -C "$work/package" -c core.autocrlf=false add --force --all

# For a later feature, apply all earlier feature files here with git apply --index.
base="$(git -C "$work/package" write-tree)"
feature="$repo/patches/series/@tarojs__runtime@4.2.1/01-mini-app-page-rendering.patch"
git -C "$work/package" apply --index "$feature"

# Edit the extracted package files now. For a new feature, omit the preceding apply.
# Do not apply subsequent features before capturing this feature's diff.
git -C "$work/package" -c core.autocrlf=false add --force --all
git -C "$work/package" diff --cached --binary --full-index \
  --no-color --no-ext-diff --no-textconv --no-renames \
  --src-prefix=a/ --dst-prefix=b/ "$base" -- > "$feature"

pnpm patches:build @tarojs/runtime@4.2.1
pnpm install
```

Register new feature files in `series.json` at their intended position. Recompose the full series: edits to an earlier feature may require rebasing later features. Keep descriptions in this inventory aligned with the series.

## Verify

```sh
pnpm patches:check
pnpm typecheck:scripts
node --test scripts/compose-patch-series.test.ts
```

Check mode recomposes from pristine upstream and compares bytes. It does not rewrite generated patches, workspace configuration or the lockfile. CI runs it after frozen installation on Linux and Windows. Patch files are forced to LF in `.gitattributes`; the temporary index disables host clean filters and newline conversion so upstream contents remain unchanged.
