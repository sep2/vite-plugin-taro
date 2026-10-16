# Dependency patch series

pnpm applies one combined patch to each package version. We maintain **15 feature patches across 5 packages**, with explicit application order in [`series.json`](./series.json). The files in `series/` are authoritative; `generated/` is reproducible installation output.

## Feature inventory

| Package | Ordered feature patches | Purpose |
| --- | --- | --- |
| `@tarojs/plugin-html@4.3.0` | `01-html-display-defaults` | Populate upstream HTML inline/block element sets without the Taro compiler rewriting installed files. |
| `@tarojs/plugin-framework-react@4.3.0` | `01-react19-root-api` | Use React 19 concurrent roots for App and standalone native-component entries; make standalone native-component setup explicitly synchronous with `flushSync`. |
| | `02-mini-app-page-rendering` | Create custom App containers as logical roots and place Page children in an opaque outlet inside the singleton React App. |
| | `03-h5-router-container` | Give H5 Page children a dedicated `taro_router` container so routing CSS does not target unrelated App siblings. |
| | `04-page-prerender` | Deduplicate queued and rendered Page identities for caller-controlled prerendering. Preserve the original queue, render/unmount flow, mount signature and native update scheduling. |
| `@tarojs/react@4.3.0` | `01-react19-reconciler` | Target the pinned React 19 reconciler contract directly: concurrent roots, commit updates, scoped event priorities, error callbacks and distinct synchronous callback/work flushing. Remove legacy render APIs and align declarations. |
| | `02-renderer-host` | Delegate node creation, form classification and commit boundaries through VPT's private renderer-host import, and expose the generic host type. |
| `@tarojs/runtime@4.3.0` | `01-mini-app-page-rendering` | Construct the App host as a scheduler, derive initial reset paths from the root prefix, and stop App serialization at the Page outlet. |
| | `02-page-prerender` | Type native Page data as an object or factory and let onLoad adopt a caller-prepared identity without moving lifecycle dispatch. VPT stores that identity in non-enumerable `__vpt_meta.prerenderIdentity`; the factory signature is unchanged. |
| | `03-delegate-dom` | Expose overridable child insertion/removal/reset, text, attribute, style and event delegation methods while Taro owns logical state, event identities, mutation records and context-cache invalidation. The defaults preserve template payload preparation. |
| | `04-event-listener-removal` | Preserve registered event handlers when removal targets an unregistered function; matching handlers retain their ordinary removal behavior. |
| | `05-event-target-data` | Preserve platform target datasets when logical indexes miss and keep distinct unresolved event targets separate. |
| | `06-style-property-names` | Use the setter's original storage key when reading or removing hyphen-prefixed style properties. |
| | `07-clone-delegation` | Construct clones through existing presentation delegates, preserving fresh identity, parent links and dynamic style accessors. |
| `canvas-confetti@1.9.4` | `01-canvas-confetti-enhancements` | Keep all existing confetti enhancements together: rotation/tilt controls, frame-clock repeat emission, cached path drawing, and DOMMatrix input normalization. Source, browser and module builds stay aligned. |

The React renderer imports its host through `\0vpt:renderer-host`. VPT's Mini resolver binds that private import through `taro.hostPath`: template targets use `src/runtime/mini/template/template-host.ts`, while TT DOM preference uses the startup selector in `src/runtime/tt/renderer-host.ts`. The generic `RendererHost` type is exported by `vite-plugin-taro-runtime/react`: it accepts the root container and host context for element/text creation, classifies form elements, and receives optional pre-commit and synchronous post-commit callbacks. VPT's recursive implementation uses Taro's document and `FormElement` and owns App/Page outlet projection. React reconciliation, prop comparison, controlled-input restoration and App/Page mounting retain their existing behavior.

VPT's `mini/vpt/create-vpt-app.ts` passes the exact App container to the selected host's `bindApp` method. The template implementation in `mini/template/bind-template-app.ts` configures the App scheduler's native data sink and delegates Page mounting to Taro. App batches reach hidden native Pages before the current Page, whose callback completes the update. The mount callback seeds a lazy App snapshot alongside the Page's initial payloads before Taro attaches its native context. `mini/template/create-template-host.ts` uses Taro's `extend` API to select `app.*` / `page.*` paths and keep outlet topology out of template App batches. Taro owns payload preparation, serialization and scheduling.

Taro's `insertBefore` and `removeChild` invoke `delegateChildInsertion` and `delegateChildRemoval` after updating the logical relationships. `appendChild`, `replaceChild`, moves and fragment expansion reuse those same primitives. The delegation methods are replaceable through the existing `TaroNode.extend` API; their default implementations retain Taro's lazy template payloads and insertion-position heuristic. Dispatch happens for detached parents as well as rooted nodes, before template path calculation or hydration preparation. Removal receives the original options even when `doUpdate: false`, because that flag batches template writes while the child is still logically removed. Event identity cleanup, mutation observer ordering and context-cache invalidation remain in Taro's mutation methods; the template scheduler is unchanged.

`TaroText.delegateTextUpdate` runs after Taro records the character-data mutation and updates `_value`. The existing `textContent`, `nodeValue` and `data` setters share that boundary, preserving their getters, identity and mutation records. Its default retains the original template payload; a host can replace it through `extend(TaroText, 'delegateTextUpdate', ...)` before any template path calculation. Delegation runs for detached and attached text nodes, and construction initializes the logical value without invoking an update.

`TaroElement.delegateAttributeUpdate` and `delegateAttributeRemoval` run after logical attribute mutation, before template alias lookup, path calculation and payload hooks. Taro retains props, dataset updates, ID registration, observer records and removal interception. Its pre-mutation `isPureView` / `isStaticView` flags are forwarded so the default delegates preserve exact template transitions. Missing or intercepted removals retain their early returns. Both methods are replaceable through `TaroElement.extend`.

`Style.delegateStyleUpdate` receives the completed logical style through its `this` receiver. Single-property changes pass the normalized property name and assigned value; null, undefined and empty strings clear that property. Ordinary names use camelCase, while CSS variables and hyphen-prefixed names retain their spelling. Property assignment, `setProperty`, `removeProperty`, CSS variables and `cssText` retain Taro's normalization and observer behavior. A bulk `cssText` assignment delegates once without arguments after its synchronous `_pending` batch, identifying a whole-style replacement. Native hosts can forward single-property changes directly; the template default still serializes the complete style. Taro's mutation old-value recording and SDK-internal serialization have their own costs. Hosts can replace the method through `extend(Style, 'delegateStyleUpdate', ...)`. Attribute-form style changes retain both notifications: the Style delegate runs first, followed by the attribute delegate with the original style value or removal name. A native host can handle styles through the Style delegate and distinguish those attribute notifications by their `style` name.

`TaroNode.delegateChildReset` handles complete child-list updates, including the final notification from element `textContent`. Taro still removes and inserts individual children through its ordinary mutation methods, then invokes this existing full-list boundary. The template default lazily hydrates the current children or emits an empty list when `isClean` is true. The public declaration and `TaroNode.extend` let hosts handle that final notification before template payload preparation.

`TaroElement.delegateEventUpdate` owns template event-related node classification. It runs before logical addition and after logical removal, preserving the HTML hooks and `sideEffect: false` behavior. A host replaces this effect independently of `delegateEventListener(type, subscribed)`, which runs after the first handler is stored or the last handler is removed. Subscription transitions read the existing handler array length in O(1); the ordinary handler search/removal remains O(H) for H handlers of that event. Taro retains case normalization, `once`, handler wrapping and `regionchange` expansion.

Subscription notifications carry Taro’s lowercase logical event names: `regionchange` produces `begin` and `end` transitions. Native event-name mapping belongs to the platform host.

`eventHandler(event, currentNode?)` accepts a known logical receiver from a native host. Both entry forms run the existing platform normalization first; template callbacks then resolve the receiver through Taro's event index, while a supplied node goes directly to the same dispatch path. Event construction, hooks, React priority, form updates, callback returns and the existing native-bubbling batch retain their shared implementation. The optional receiver adds one constant-time selection and skips the entry's ID lookup; existing ancestor traversal and event-property processing retain their costs. The target getters resolve datasets independently through their existing logical index lookups.

`04-event-listener-removal` returns when the existing handler search finds no match, preserving the listener array and its callable entries. Taro retains its development warning, function-wrapper matching, case normalization and automatic `once` removal. The regression tests exercise public node methods and dispatch in WX, ZFB and TT template configurations, in development and production. The guard adds O(1) work to the existing O(H) handler search/removal.

`05-event-target-data` keeps logical datasets authoritative when their index lookups succeed, falling back to the corresponding platform dataset only on a miss. Target data retains Alipay's existing two-source merge order. An unresolved currentTarget shares the target wrapper only when both raw targets are the same object; manually constructed events without platform targets retain their shared wrapper. Distinct unresolved targets keep their own data. The getters retain their two index reads, existing dataset/detail processing and lazy caches. No index restoration, tree traversal or persistent state is added. Copying actual fallback data costs O(D) for D dataset fields rather than copying empty objects; detail processing retains O(K) for K detail fields. Cross-platform regressions cover indexed and native data, merge precedence, target identity, reinsertion and cache reuse without installing a DOM host.

Upstream: [NervJS/taro#19528](https://github.com/NervJS/taro/pull/19528). Retire `05-event-target-data` when the pinned `@tarojs/runtime` release includes this fix: remove its series entry and feature patch, recompose the generated runtime patch, refresh the lockfile, and retain the regression tests to verify the upstream implementation.

`06-style-property-names` makes `getPropertyValue` and `removeProperty` prefer an existing original storage key, then resolve other names through camelCase. This supports both hyphen-prefixed `setProperty` writes and direct assignments to registered vendor setters such as `WebkitLineClamp`; when both keys exist, the original key takes precedence. CSS variables always retain their spelling. Selection uses the existing `_usedStyleProp` set, so an unused dynamic accessor does not hide a live camelCase value. Whole-style clearing uses the same removal path; no extra state or style-table scan is added.

Upstream: [NervJS/taro#19530](https://github.com/NervJS/taro/pull/19530). Retire `06-style-property-names` when the pinned `@tarojs/runtime` release includes this fix: remove its series entry and feature patch, recompose the generated runtime patch, refresh the lockfile, and retain the style regressions.

`07-clone-delegation` initializes text through the document factory and forwards copied attributes, each nonempty completed style and each cloned child through host-replaced delegates. It captures the default template delegates before host installation: those functions prepare incremental payloads and are skipped during clone construction, including scheduler-root clones. Default-template attributes use a direct shallow copy; native attributes are copied and delegated in the same loop. Cloning constructs parent/child relationships directly, retaining the source's ID lookup and avoiding public mutation observer records and sibling searches. Every clone has its own sid, native handle and handler state. Dynamic style accessors are recreated on the new Style object. Construction is linear in cloned nodes, attributes, dataset keys and style entries, plus the selected host's work. Ordinary mutation delegates retain their existing behavior.

`vite-plugin-taro-runtime/runtime/tt-document` exposes Taro's existing `bom/document.js` factory directly. Its native DOM declarations live in the runtime package's `types/tt-document.d.ts`.

React 19 support spans the renderer and framework packages. The renderer targets `react-reconciler@0.34.0` and React 19.3, without legacy roots, React 18 host signatures or API probing. `render` and `findDOMNode` are no longer exported; callers use `createRoot` and refs. The internal `unmountComponentAtNode` host-lookup helper remains, but only tears down concurrent roots. Public `flushSync` runs callbacks through `flushSyncFromReconciler`; controlled-input restoration calls `flushSyncWork` before restoring native values. Neither operation waits for native `setData` completion.

Mini App/Page rendering spans the runtime, renderer and framework packages; their corresponding patches must stay coordinated. The series are maintenance boundaries, **not independently selectable runtime features**.

The original feature split preserved the previous patched package bytes; the React-19-only adaptation now simplifies that renderer contract. Once the App is ready, opted-in WX glass-easel Pages render synchronously inside the native data factory with either Skyline or WebView; existing native onLoad reuses their hosts and dispatches business hooks at the usual point. Other Page mounts and native setData scheduling retain their ordinary asynchronous behavior. No attached hook or synthetic lifecycle delivery participates. Only upstream Taro's standalone/mixed-mode component bootstrap now explicitly flushes its initial React commit: the pinned reconciler already ignored its old legacy-root request, so that path previously had no synchronous-commit guarantee. VPT's generated App/Page entries do not call that standalone bootstrap.

## Page prerender contract

Routes opt into the native Page data factory through `pages[].prerender: true`. Omission or `false` registers the original config directly, without a data factory or prerendering. Registration does not branch on the target; factory execution depends on native host support (glass-easel on WX). VPT's shared Taro runtime initializes query capture during App capsule activation, installing one `wx.onBeforePageLoad` listener when the host provides that API (base library 3.5.5+) and otherwise doing nothing. No navigation API is replaced: there is no URL parser, loader map, navigation queue, speculative tree or cancellation protocol.

The native `Page({ data: () => ... })` factory initializes the existing global router. Object-form registration preserves DevTools Page-script hot delivery; the chaining API does not re-execute these scripts on edits. VPT wraps the ordinary App `mount()` call in `flushSync`, then serializes App/Page hosts with Taro's existing serializer. VPT's App adapter delegates to Taro's mount method with its original signature and seeds presentation data in the commit callback. A cold App is not forced to render: until its wrapper is ready, mounting follows the existing asynchronous path and the data factory returns the ordinary seed. Native onLoad adopts the instance identity and reuses its element; lifecycle dispatch and native context binding remain where they were. The upstream Taro factory still returns its ordinary object-valued seed; its `PageInstance.data` declaration now also accepts a native data factory. VPT's `runtime/mini/vpt/create-vpt-page.ts` chooses the final native data form on that same config: without prerender it retains the data object; with prerender it replaces `data` with a factory that captures the component, route and seed and calls `prerenderToData(config, component, routePath, initialData)`. Non-enumerable `__vpt_meta` contains only the one-shot `prerenderIdentity`, so the original onLoad consumes the identity written by prerendering without a config copy. The Page capsule only calls `createVptPage(PageComponent, __VPT_PAGE_OPTIONS__)` and exports its result; the factory owns the seed, while one placeholder supplies the route's `VptPageOption`; the native shell only calls `Page(pageConfig)`. There are no platform constructor adapters, constructor contract fields, wrapper return objects, WeakMaps or initializer callbacks. `bootstrap.ts` initializes SystemJS, polyfills and transport, and exports the loader and preload helper. Prerendering imports `getPageQuery` directly from `mini/vpt/get-page-query.ts`, so the shared Taro runtime installs query capture during App capsule activation, before native App/Page registration. The App capsule calls `createVptApp(AppComponent, __VPT_APP_CONFIG__)` through the shared Taro facade; the adapter imports React and the shared renderer directly. `mini/vpt/` owns the Taro facade, App/Page adapters, query capture and shared host type; `mini/template/` owns template host installation, App data broadcasting and prerender serialization; `mini/capsule/` contains the App, Page and component activation entries. The Taro patch keeps the original factory signature: native onLoad reads and clears `config.__vpt_meta.prerenderIdentity` once, then follows its normal lifecycle path. Ordinary Taro configs without VPT metadata retain their normal initialization. No identity-reader callback is passed to the factory. WX glass-easel retains native Page instances during hot registration without invoking their data factory or replaying lifecycles. The shared HMR helper tracks native instances through ordinary lifecycle wrappers and detects glass-easel by its instance-level `groupUpdates` method. Hot registration of those Pages leaves the lifecycle gate and data factory untouched: no lifecycle suppression, native snapshot copying, or deferred cleanup participates. Pages without that capability retain their existing lifecycle gate and snapshot handoff, replacing `config.data` with the native snapshot rather than invoking a factory. No separate prerender-suppression flag is needed; selection is per mounted Page, not per target or App configuration. Only the shared Page shell is transformed: HMR prepares the exported config immediately before native registration, preserving its data factory on glass-easel. No Activity, renderer observer, timer, snapshot cache, second React root or new router context participates. Both modes of `useRouter` remain upstream behavior.

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
pnpm patches:build @tarojs/runtime@4.3.0
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
pnpm patch @tarojs/runtime@4.3.0 --ignore-existing --edit-dir "$work/package"
git -C "$work/package" init --quiet --object-format=sha1
git -C "$work/package" -c core.autocrlf=false add --force --all

# For a later feature, apply all earlier feature files here with git apply --index.
base="$(git -C "$work/package" write-tree)"
feature="$repo/patches/series/@tarojs__runtime@4.3.0/01-mini-app-page-rendering.patch"
git -C "$work/package" apply --index "$feature"

# Edit the extracted package files now. For a new feature, omit the preceding apply.
# Do not apply subsequent features before capturing this feature's diff.
git -C "$work/package" -c core.autocrlf=false add --force --all
git -C "$work/package" diff --cached --binary --full-index \
  --no-color --no-ext-diff --no-textconv --no-renames \
  --src-prefix=a/ --dst-prefix=b/ "$base" -- > "$feature"

pnpm patches:build @tarojs/runtime@4.3.0
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
