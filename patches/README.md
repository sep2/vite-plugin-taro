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
| | `02-page-prerender` | Let native onLoad adopt a caller-prepared identity without moving lifecycle dispatch. VPT prepares the identity and stores it in `__vpt_meta.prerenderIdentity` inside the non-enumerable metadata; the factory signature is unchanged. |
| `canvas-confetti@1.9.4` | `01-canvas-confetti-enhancements` | Keep all existing confetti enhancements together: rotation/tilt controls, frame-clock repeat emission, cached path drawing, and DOMMatrix input normalization. Source, browser and module builds stay aligned. |

React 19 support spans the renderer and framework packages. The renderer targets `react-reconciler@0.34.0` and React 19.3, without legacy roots, React 18 host signatures or API probing. `render` and `findDOMNode` are no longer exported; callers use `createRoot` and refs. The internal `unmountComponentAtNode` host-lookup helper remains, but only tears down concurrent roots. Public `flushSync` runs callbacks through `flushSyncFromReconciler`; controlled-input restoration calls `flushSyncWork` before restoring native values. Neither operation waits for native `setData` completion.

Mini App/Page rendering spans the runtime, renderer and framework packages; their corresponding patches must stay coordinated. The series are maintenance boundaries, **not independently selectable runtime features**.

The original feature split preserved the previous patched package bytes; the React-19-only adaptation now simplifies that renderer contract. Once the App is ready, WX glass-easel Pages render synchronously inside the native data factory with either Skyline or WebView; existing native onLoad reuses their hosts and dispatches business hooks at the usual point. Other Page mounts and native setData scheduling retain their ordinary asynchronous behavior. No attached hook or synthetic lifecycle delivery participates. Only upstream Taro's standalone/mixed-mode component bootstrap now explicitly flushes its initial React commit: the pinned reconciler already ignored its old legacy-root request, so that path previously had no synchronous-commit guarantee. VPT's generated App/Page entries do not call that standalone bootstrap.

## Page prerender contract

WX glass-easel routes receive the native data factory, independently of their renderer. The WX prerender helper imports a shared module that installs one `wx.onBeforePageLoad` listener to record the actual native query (base library 3.5.5+). No navigation API is replaced: there is no URL parser, loader map, navigation queue, speculative tree or cancellation protocol.

The native `.data()` callback initializes the existing global router. VPT wraps the ordinary App `mount()` call in `flushSync`, then serializes App/Page hosts with Taro's existing serializer. Taro's mount implementation and signature remain unchanged. A cold App is not forced to render: until its wrapper is ready, mounting follows the existing asynchronous path and the data factory returns the ordinary seed. Native onLoad adopts the instance identity and reuses its element; lifecycle dispatch and native context binding remain where they were. `createPageConfig()` returns the ordinary config, including its object-valued `data`. The Page capsule retains its ordinary `createPageConfig(...)` call and default config export. VPT's `runtime/mini/capsule/create-page-config.ts` adds non-enumerable `__vpt_meta` containing the component, route and `skipPrerender` flag; prerender stores the one-shot prepared identity in the same object as `prerenderIdentity`. The shared native shell imports the target-selected Page constructor from `vpt.ts` and calls `Page(pageConfig)`. WX's constructor calls `prerenderToData(config)` from its native data factory; TT/Alipay alias native `Page`. Metadata stays out of native methods without another return wrapper, WeakMap or initializer argument. `bootstrap.ts` initializes SystemJS, polyfills and transport before `vpt.ts` re-exports the loader and constructor. Native imports of both entry and ordinary capsules link through that initialized loader, so constructor dependencies cannot request capsules before SystemJS is ready. The Taro patch keeps the original factory signature: native onLoad reads and clears `config.__vpt_meta.prerenderIdentity` once, preserving the remaining metadata, then follows its normal lifecycle path. Ordinary Taro configs without VPT metadata retain their normal initialization. No identity-reader callback is passed to the factory. Page HMR sets its private `isReregistering` lifecycle gate and `__vpt_meta.skipPrerender` before DevTools synthetic re-registration. The native data factory reads only `skipPrerender` to reuse the mounted Page's data; the existing onShow gate clears both flags. Only the shared Page shell is transformed; constructors need no HMR source rewriting. No Activity, renderer observer, timer, snapshot cache, second React root or new router context participates. Both modes of `useRouter` remain upstream behavior.

A committed Suspense fallback is valid initial content. If the Page suspends without a committed fallback, the factory returns the ordinary seed and onLoad mounting finishes when content becomes available. The starter template sets `glassEaselWebview: true` under App JSON `window` (not at the top level) so data factories also work in WebView fallback (base library 3.8.12+). WX now requires glass-easel; there is no exparser fallback. Existing projects must set `componentFramework: 'glass-easel'` and supply that WebView setting; the plugin does not inject Page overrides.

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
