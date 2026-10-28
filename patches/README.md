# Dependency patch series

pnpm applies one combined patch to each package version. We maintain **25 feature patches across 5 packages**, with explicit application order in [`series.json`](./series.json). The files in `series/` are authoritative; `generated/` is reproducible installation output. Feature filenames are numbered consecutively from `01` in each package’s application order.

## Feature inventory

| Package | Ordered feature patches | Purpose |
| --- | --- | --- |
| `@tarojs/plugin-html@4.3.1` | `01-html-elements` | Populate upstream HTML inline/block element sets and share their pure classifications and semantic classes between templates and native DOM hosts. |
| `@tarojs/plugin-framework-react@4.3.1` | `01-react19-root-api` | Use React 19 concurrent roots for App and standalone native-component entries; make standalone native-component setup explicitly synchronous with `flushSync`. |
| | `02-mini-app-page-rendering` | Create custom App containers as logical roots and place Page children in an opaque outlet inside the singleton React App. |
| | `03-h5-router-container` | Give H5 Page children a dedicated `taro_router` container so routing CSS does not target unrelated App siblings. |
| | `04-page-prerender` | Deduplicate queued and rendered Page identities for caller-controlled prerendering. Preserve the original queue, render/unmount flow, mount signature and native update scheduling. |
| | `05-page-host-context` | Select the existing Mini Page root's host type and present native Pages through root updates. |
| `@tarojs/react@4.3.1` | `01-react19-reconciler` | Target the pinned React 19 reconciler contract directly: concurrent roots, commit updates, scoped event priorities, error callbacks and distinct synchronous callback/work flushing. Remove legacy render APIs and align declarations. |
| | `02-renderer-host` | Delegate node creation, form classification and commit boundaries through VPT's private renderer-host import, and expose the generic host type. |
| | `03-page-host-context` | Delegate Page-root type and child host-context selection to required host callbacks. |
| | `04-event-handler-replacement` | Add replacement React callbacks before removing their predecessors, preserving continuous native subscriptions and logical handler order. |
| | `05-style-update-batching` | Expose a synchronous style-prop boundary so the WX DOM host serializes and forwards the final logical style once. |
| | `06-development-element-attributes` | Omit direct React-element host attributes during development, preserving React 19 Fast Refresh and production output. |
| `@tarojs/runtime@4.3.1` | `01-mini-app-page-rendering` | Construct the App host as a scheduler, derive initial reset paths from the root prefix, and stop App serialization at the Page outlet. |
| | `02-page-lifecycle` | Support object-or-factory Page data and caller-owned Page mounting with Taro lifecycle ordering and teardown. |
| | `03-delegate-dom` | Delegate DOM presentation and context lookup/invalidation to the selected host, and create replacement text through ownerDocument. Taro retains logical state, event identities and mutation records; template defaults retain payload preparation and epoch-based context caching. |
| | `04-clone-delegation` | Construct clones through existing presentation delegates, preserving fresh identity, parent links and dynamic style accessors. |
| | `05-same-parent-moves` | Reorder existing siblings through one insertion delegate, retain logical identity and lazily serialize the final template child list. |
| | `06-mutation-observer-fast-path` | Prepare mutation records, old-value snapshots and sibling metadata only while observers are registered. |
| | `07-template-hydration` | Allocate lazy hydration callbacks when constructing template payloads. |
| | `08-template-attribute-state` | Delegate pre-mutation attribute classification; template hosts retain pure/static view transitions and native hosts use a constant state. |
| | `09-lazy-style` | Initialize an element’s mutable Style declaration on first access; attribute reads, hydration and cloning preserve lazy allocation for unstyled elements. |
| | `10-lazy-event-handlers` | Materialize per-target handler tables on mutable access; listener queries, dispatch, propagation and native subscription checks read existing storage. |
| | `11-direct-event-cleanup` | Traverse existing child arrays by index when removing subtree SID/ID entries, preserving parent-first cleanup and sibling order. |
| | `12-native-event-targets` | Delegate event target lookup: templates resolve logical datasets through their indexes, while DOM hosts use SDK target records. |
| `canvas-confetti@1.9.4` | `01-canvas-confetti-enhancements` | Keep all existing confetti enhancements together: rotation/tilt controls, frame-clock repeat emission, cached path drawing, and DOMMatrix input normalization. Source, browser and module builds stay aligned. |

The React renderer imports its host through `\0vpt:renderer-host`. VPT's Mini resolver binds that private import through `taro.hostPath`: template targets use `src/runtime/mini/template/template-host.ts`, while TT DOM preference uses the startup selector in `src/runtime/tt/renderer-host.ts`. The generic `RendererHost` type is exported by `vite-plugin-taro-runtime/react`: it accepts the root container and host context for element/text creation, classifies form elements, and receives optional pre-commit and synchronous post-commit callbacks. VPT's recursive implementation uses Taro's document and `FormElement` and owns App/Page outlet projection. The React framework provides reconciliation, prop comparison, controlled-input restoration and App mount/unmount primitives; VPT coordinates native Page lifetimes.

VPT's `mini/vpt/create-vpt-app.ts` passes the exact App container to the selected host's `bindApp` method. The template implementation in `mini/template/bind-template-app.ts` configures the App scheduler's native data sink around VPT-controlled Page mounting. App batches reach hidden native Pages before the current Page, whose callback completes the update. The mount callback seeds a lazy App snapshot alongside the Page's initial payloads before VPT attaches its native context. `mini/template/create-template-host.ts` uses Taro's `extend` API to select `app.*` / `page.*` paths and keep outlet topology out of template App batches. Taro owns payload preparation, serialization and scheduling.

Ordinary React Apps use Taro's `mount(component, id, onCommit)` contract, including template prerendering and H5. VPT's template wrapper seeds presentation in that callback. WX attachment associates the Page identity with its native creation document before mounting; the App wrapper makes each mount synchronous. Taro's native entries use `mount(component, id, getCtx, onCommit)`: their wrapper resolves `getCtx()` during construction to supply native props, `$scope` and the root context. VPT binds ordinary Page context at the React commit callback. Taro's onLoad initializes that native instance's ready/show barrier before invoking the supplied mount function with its load callback. The callback dispatches load before initial native presentation and releases the lifecycle barrier.

The renderer exports `getPageRootType(id)`, which calls the required `RendererHost.getPageRootType` method. The framework uses that type at the existing Mini Page-root position; it must remain stable for the Page instance. The required `RendererHost.getChildHostContext(parentContext, type)` method selects the context inherited by descendants. TT DOM and template hosts return `root` and the unchanged parent context. The WX DOM host derives the root type solely from the Page identity and resolves its creation document through child host context. Element/text factories already receive this context. The Page root itself receives its parent's context during creation, so the adapter resolves its own root type in `createElement`. Page associations, factory ownership and disposal belong to VPT. Each dispatch adds O(1) work, plus the host callback's cost.

Element `textContent` replacement uses `ownerDocument.createTextNode`, preserving the factory selected by a host-owned document. Clearing content retains its allocation-free path.

Taro's `insertBefore` and `removeChild` invoke `delegateChildInsertion` and `delegateChildRemoval` after updating the logical relationships. `appendChild`, `replaceChild`, moves and fragment expansion reuse those same primitives. The delegation methods are replaceable through the existing `TaroNode.extend` API; their default implementations retain Taro's lazy template payloads and insertion-position heuristic. Dispatch happens for detached parents as well as rooted nodes, before template path calculation or hydration preparation. Removal receives the original options even when `doUpdate: false`, because that flag batches template writes while the child is still logically removed. Event identity cleanup and mutation observer ordering remain in Taro's mutation methods; context invalidation dispatches after presentation through the selected host policy. The template scheduler is unchanged.

`05-same-parent-moves` keeps same-parent reordering inside `insertBefore`: it splices the existing child out of the logical array while retaining its parent and event indexes, inserts at the current anchor, and invokes `delegateChildInsertion` once. Its optional `previousIndex` identifies a move, including index zero. The template default queues a lazy full child-list reset so append, replacement and multiple moves serialize the final order. Native hosts directly insert the attached node. WX custom components receive `moved` for same-parent reordering; actual deletion receives `detached`, and cross-parent movement retains removal followed by insertion. Self-insertion and self-replacement leave the tree unchanged. Ordinary insertion mutation records remain in Taro, and context invalidation follows the selected host policy. Array searches and splices remain O(N) per move for N siblings, with O(1) extra move metadata; template hydration retains its existing subtree cost.

`03-delegate-dom` keeps nearest-context lookup in the template `_scope` getter, and the exported `getNearestCtx(node)` reads that property. Templates retain the environment and rooted-node checks, WeakMap cache and root epochs: cache hits skip the nearest-context scan, and child mutations invalidate after presentation with one root lookup through `delegateContextInvalidation()`. Page context binding/unbinding and recursive-component attachment/detachment use `invalidateNearestCtx(node)` to select the same invalidation policy. WX and TT DOM hosts set `_scope` to a constant undefined value and install a no-op invalidation delegate. Both native scope entry points return undefined for attached and detached nodes, even when Page or component contexts are bound. Native lookup and invalidation are O(1); template scope reads retain their O(depth) root check and cached nearest-context results. Template invalidation ordering, payload serialization and observer behavior are preserved.

`06-mutation-observer-fast-path` exposes `MutationObserver.hasObservers` as an O(1) read of the existing observer registrations. Child, text, attribute and style mutations check it before preparing records. With no registered observers, style changes skip old-CSS serialization, child insertions/removals skip record-only sibling searches, and `textContent` skips its old-child snapshot and aggregate record. Registered observers retain mutation ordering, old values, subtree matching, `takeRecords` and asynchronous delivery; the existing registration list remains the only observer-presence state. Presentation delegates and template scheduling retain their existing behavior. This removes observer-metadata searches that otherwise accumulate O(N²) work when appending N siblings without observers; logical reordering still uses its existing array searches and splices.

`TaroText.delegateTextUpdate` runs after Taro records the character-data mutation and updates `_value`. The existing `textContent`, `nodeValue` and `data` setters share that boundary, preserving their getters, identity and mutation records. Its default retains the original template payload; a host can replace it through `extend(TaroText, 'delegateTextUpdate', ...)` before any template path calculation. Delegation runs for detached and attached text nodes, and construction initializes the logical value without invoking an update.

`08-template-attribute-state` introduces `TaroElement.prepareAttributeMutation(removing)` before attribute mutation, observer recording and removal interception. The template default captures pure-view state for writes and static-view state for removals, preserving the existing prop and handler checks. WX and TT DOM hosts install a shared constant-false callback, making preparation O(1) with no prop or handler enumeration. The public setters, logical state, ID registration, observer ordering, removal hooks and post-mutation delegates remain shared. Preparation uses a local boolean and allocates no persistent state.

`TaroElement.delegateAttributeUpdate` and `delegateAttributeRemoval` run after logical attribute mutation, before template alias lookup, path calculation and payload hooks. Taro retains props, dataset updates, ID registration, observer records and removal interception. Its pre-mutation `isPureView` / `isStaticView` flags are forwarded so the default delegates preserve exact template transitions. Missing or intercepted removals retain their early returns. Both methods are replaceable through `TaroElement.extend`.

`09-lazy-style` gives each element a lazily initialized `Style` accessor with stable identity and writable replacement. The element stores the declaration only after first access. `getAttribute('style')`, attribute enumeration and template hydration read existing declarations or return empty CSS; clones allocate independent style storage only when their source has a declaration. Property setters, CSS normalization, observer records and presentation delegates use the existing Style implementation. Construction avoids a Style object, its Set and its value object for each element whose declaration remains unaccessed. First access and subsequent lookup are O(1); serialization and clone copying retain their existing linear style-entry costs.

`Style.delegateStyleUpdate` receives the completed logical style through its `this` receiver. Single-property changes pass the normalized property name and assigned value; null, undefined and empty strings clear that property. Ordinary names use camelCase, while CSS variables and hyphen-prefixed names retain their spelling. Property assignment, `setProperty`, `removeProperty`, CSS variables and `cssText` retain Taro's normalization and observer behavior. A bulk `cssText` assignment delegates once without arguments after its synchronous `_pending` batch, identifying a whole-style replacement. Native hosts can forward single-property changes directly; the template default still serializes the complete style. Taro's mutation old-value recording and SDK-internal serialization have their own costs. Hosts can replace the method through `extend(Style, 'delegateStyleUpdate', ...)`. Attribute-form style changes retain both notifications: the Style delegate runs first, followed by the attribute delegate with the original style value or removal name. A native host can handle styles through the Style delegate and distinguish those attribute notifications by their `style` name.

`07-template-hydration` keeps lazy subtree serialization in template payload construction. Incremental insertion and replacement payloads capture their target node and call the shared serializer when evaluated, so queued updates read the final tree. Node construction allocates no hydration callback or hydration property. Native child delegates perform their SDK operations directly. The change saves one function allocation per Mini node while preserving template serialization complexity and scheduling.

`TaroNode.delegateChildReset` handles complete child-list updates, including the final notification from element `textContent`. Taro still removes and inserts individual children through its ordinary mutation methods, then invokes this existing full-list boundary. The template default lazily hydrates the current children or emits an empty list when `isClean` is true. The public declaration and `TaroNode.extend` let hosts handle that final notification before template payload preparation.

`10-lazy-event-handlers` exposes a lazy, writable `__handlers` accessor and `getEventHandlers(type)` for non-allocating reads. Construction, empty listener checks, absent-listener removal, dispatch, ancestor searches and propagation keep untouched targets free of handler storage, including text and comment nodes. HTML hooks obtain the mutable table when installing aliases. Once allocated, the table and its arrays retain identity across listener removal and callback replacement; cloning keeps each target’s independent listener state. WX and TT subscription checks use the read accessor, including TT catchMove and intrinsic form-event delivery. Empty-table queries are O(1); materialized-table classification retains its existing event-key scans, and handler removal retains its O(H) search.

`11-direct-event-cleanup` uses indexed child traversal in `EventSource.removeNodeTree()`. Each node’s SID is deleted before its distinct, nonempty UID, followed by descendants in sibling order. The traversal reads the existing dense child arrays and captures each array’s length once. It retains recursive O(N) cleanup with O(depth) call-stack space while eliminating the per-node callback expression. Child arrays, parent links and listener tables retain their identities; `cleanRef: false` moves preserve their event indexes, and `doUpdate: false` removals retain ordinary cleanup. Identity deletion still completes before the removal presentation delegate.

`TaroElement.delegateEventUpdate` owns template event-related node classification. It runs before logical addition and after logical removal, preserving the HTML hooks and `sideEffect: false` behavior. A host replaces this effect independently of `delegateEventListener(type, subscribed)`, which runs after the first handler is stored or the last handler is removed. Subscription transitions read the existing handler array length in O(1); the ordinary handler search/removal remains O(H) for H handlers of that event. Taro retains case normalization, `once`, handler wrapping and `regionchange` expansion.

Subscription notifications carry Taro’s lowercase logical event names: `regionchange` produces `begin` and `end` transitions. Native event-name mapping belongs to the platform host.

`eventHandler(event, currentNode?)` accepts a known logical receiver from a native host. Both entry forms run the existing platform normalization first; template callbacks then resolve the receiver through Taro's event index, while a supplied node goes directly to the same dispatch path. Event construction, hooks, React priority, form updates, callback returns and the existing native-bubbling batch retain their shared implementation. The optional receiver adds one constant-time selection and skips the entry's ID lookup; existing ancestor traversal and event-property processing retain their costs. The target getters select their dataset source through `TaroEvent.getTargetElement(target, useTargetDataset)`.

`12-native-event-targets` keeps template target lookup in `TaroEvent.getTargetElement(target, useTargetDataset)`, including Alipay’s separate bubbling-target dataset. WX and TT DOM hosts return null from this lookup so the existing getters use SDK records directly. Native event datasets are authoritative even with missing, duplicate or changed IDs; target identity follows the SDK records. Lazy target caches, detail-field merging, event normalization, bubbling batches and controlled-input handling remain shared. WX creation performs no SID dataset write, and dataset attributes use the SDK setter directly. Logical SID allocation, the event index and `getElementById` remain available. Native target lookup is O(1); dataset copying and detail merging retain their O(D) and O(K) costs for D dataset entries and K detail fields.

Taro 4.3.1 supplies the shared listener, event-data and style-key contracts: unmatched listener removal preserves registered handlers ([#19529](https://github.com/NervJS/taro/pull/19529)); unresolved event indexes retain platform datasets and distinct target identities ([#19528](https://github.com/NervJS/taro/pull/19528)); style reads and removals prefer stored property keys ([#19530](https://github.com/NervJS/taro/pull/19530)). Cross-platform regression tests verify these contracts alongside VPT's delegates.

Upstream insertion validation ([#19551](https://github.com/NervJS/taro/pull/19551)) checks reference membership before detaching nodes or consuming fragments. Valid self-insertion and self-replacement preserve identity without mutations. The node-move regressions cover invalid references, unchanged source/destination trees, event indexes, observer records and presentation queues. Reference validation and same-parent moves retain O(N) array searches for N siblings.

`04-clone-delegation` initializes text through the document factory and forwards copied attributes, each nonempty completed style and each cloned child through host-replaced delegates. It captures the default template delegates before host installation: those functions prepare incremental payloads and are skipped during clone construction, including scheduler-root clones. Default-template attributes use a direct shallow copy; native attributes are copied and delegated in the same loop. Cloning constructs parent/child relationships directly, retaining the source's ID lookup and avoiding public mutation observer records and sibling searches. Every clone has its own sid, native handle and handler state. Dynamic style accessors are recreated on the new Style object. Construction is linear in cloned nodes, attributes, dataset keys and style entries, plus the selected host's work. Ordinary mutation delegates retain their existing behavior.

`vite-plugin-taro-runtime/runtime/tt-document` exposes Taro's existing `bom/document.js` factory directly. Its native DOM declarations live in the runtime package's `types/tt-document.d.ts`.

`04-event-handler-replacement` in the React series keeps an event's logical listener array nonempty while replacing a function-valued prop. The new handler is appended before the old handler is removed, so the host retains its existing SDK event entry and dispatch reads the current logical callback. Final handler order, template side-effect flags, initial subscription, final removal, HTML aliases and expanded `regionchange` events retain their normal contracts. Replacement retains the existing O(H) handler search/removal for H handlers, with one temporary logical handler and no persistent subscription state.

`05-style-update-batching` defines the required `RendererHost.batchStyleUpdate(element, update)` boundary around one React style-prop application. Every host executes the callback synchronously and exactly once. The WX DOM host scopes dirty styles in a WeakMap and defers only native forwarding, including the `cssText` read. The outermost scope clears its entry and flushes in `finally`, including completed logical mutations when a setter throws. Existing setters, numeric conversion, removals, string/object transitions and individual MutationObserver records remain intact; standalone imperative changes still forward immediately. TT DOM and template hosts forward the callback directly. For C changed properties and S serialized properties, unobserved serialization falls from O(C × S) to O(S), alongside the existing style diff; active observers still require their per-mutation old-value snapshots. Native assignments are SDK calls, not transport flushes or paint measurements.

React 19 support spans the renderer and framework packages. The renderer targets `react-reconciler@0.34.0` and React 19.3, without legacy roots, React 18 host signatures or API probing. `render` and `findDOMNode` are no longer exported; callers use `createRoot` and refs. The internal `unmountComponentAtNode` host-lookup helper remains, but only tears down concurrent roots. Public `flushSync` runs callbacks through `flushSyncFromReconciler`; controlled-input restoration calls `flushSyncWork` before restoring native values. Neither operation waits for native `setData` completion.

Mini App/Page rendering spans the runtime, renderer and framework packages; their corresponding patches must stay coordinated. The series are maintenance boundaries, **not independently selectable runtime features**.

The React-19-only adaptation uses concurrent roots. Once the App is ready, opted-in WX glass-easel template Pages render synchronously inside the native data factory with either Skyline or WebView; their native onLoad reuses those hosts and delivers business hooks. WX DOM Pages commit synchronously during Component attachment. Ordinary template Page mounts and native setData scheduling are asynchronous. Taro's standalone/mixed-mode component bootstrap explicitly flushes its initial React commit; VPT's generated Page entries compose Taro lifecycles with the shared VPT mount function.

## Page prerender contract

WX and Alipay template-rendered routes opt into the native Page data factory through `pages[].prerender: true`. Omission or `false` retains object-form Page data. The TT plugin sets each route’s `prerender` option to `false`, preserving object-form initial data and the App/Page template seed when route configuration is shared across targets. Native data-factory execution depends on host support (glass-easel on WX). VPT's selected renderer imports query capture during App capsule activation, installing one `wx.onBeforePageLoad` listener when the host provides that API (base library 3.5.5+) and otherwise doing nothing. No navigation API is replaced: there is no URL parser, loader map, navigation queue, speculative tree or cancellation protocol.

The native `Page({ data: () => ... })` factory initializes the existing global router. Object-form registration preserves DevTools Page-script hot delivery. The Page capsule calls the selected renderer's `host.createPage(PageComponent, __VPT_PAGE_OPTIONS__)` and exports its configuration; the native shell registers it with the constructor selected by its configuration shape.

Template hosts use `runtime/mini/template/create-template-page.ts` to seed App/Page data and select its native form. With `prerender: true`, `createTemplatePage` installs a data factory that creates and retains an identity, then calls `prerenderToData(component, routePath, identity, initialData)`. Prerendering wraps the ordinary App `mount()` call in `flushSync`, then serializes App/Page hosts with Taro's existing serializer. Until a cold App wrapper is ready, mounting follows the existing asynchronous path and the factory returns its seed. Prerendering returns only native data. The native onLoad adapter consumes the prerendered identity once or creates a fresh identity for an ordinary load. It calls Taro's load handler with a function that mounts this identity and invokes the supplied lifecycle callback at React commit. Both rendering helpers receive an explicit identity; identity selection belongs to the adapter. The Page key contains its route and instance counter; query parameters and Taro's timestamp live in the identity's separate params object. Taro's four-argument factory supplies lifecycle dispatchers; `PageInstance.data` accepts objects and native data factories.

The TT DOM host creates its Page configuration inline with Taro's `createPageConfig`. Native `onLoad` creates an identity from its query and mounts through `mini/vpt/mount-page.ts`, dispatching business load at React commit before attaching the root to the Page document. DOM Page registration is independent of template data and prerender policy.

The WX DOM host uses Taro's `createPageConfig` for its Component Page methods. Its `attached` callback creates an identity from the captured native query, associates its creation document with the receiver's SDK root, and passes the identity to `mini/vpt/mount-page.ts`. VPT prepares identity and context, commits React synchronously and attaches the native root. WX registers Taro's native `onLoad` directly; it dispatches the attached Page's `$taroParams`. Template mounting receives the load callback before rendering starts and invokes it at the React commit. Taro owns load/ready/show ordering per native receiver and retains its ordinary hide, unload and cleanup paths. The native shell selects `Component` for configurations with `methods`, otherwise `Page`, in its own SDK execution context. Initial WX content participates in the native first-render boundary; the `prerender` option remains a template-data policy.

`mini/vpt/` owns the Taro facade, App adapter, shared Page mounting, query capture and host contracts. `mini/template/` owns template Page creation, host installation, App data broadcasting and prerender serialization. `mini/capsule/` contains the App, Page and component activation entries. The App capsule calls `createVptApp(AppComponent, __VPT_APP_CONFIG__)` through the shared facade; that adapter imports React and the selected renderer before Page activation. The WX DOM host and template Page adapter import `getPageQuery` for attachment and native data factories, respectively. Bootstrap owns SystemJS, polyfills, transport, the loader and preload helper.

The shared Page shell passes Component definitions directly to native hot registration and prepares ordinary Page configurations through the HMR helper. WX glass-easel retains native Page instances during hot registration without invoking their data factory or replaying lifecycles. For ordinary Pages, the helper tracks instances through lifecycle wrappers and detects glass-easel by the instance-level `groupUpdates` method. Hot registration preserves those Pages' lifecycle gate and data factory. Other Pages use the existing lifecycle gate and snapshot handoff, replacing `config.data` with their native snapshot. Selection is per mounted Page. Only the shared Page shell is transformed; preparation occurs immediately before registration. Rendering retains one React App root and the upstream `useRouter` behavior.

A committed Suspense fallback is valid initial content. If the Page suspends without a committed fallback, the factory returns the ordinary seed and onLoad mounting finishes when content becomes available. The starter template sets `glassEaselWebview: true` at the top level of App JSON alongside `componentFramework` (not under `window`) and explicitly sets `pages[].config.glassEaselWebview: true` on every WX Page. This includes ordinary WebView Pages, Skyline fallback, and Pages without prerendering. The repository's WebView DevTools fixture with base library 3.17.2 required the Page flag even with the App flag enabled; WebView glass-easel support starts at 3.8.12. WX now requires glass-easel; there is no exparser fallback. Existing projects must retain the App-level `componentFramework: 'glass-easel'` and `glassEaselWebview: true` settings and add the Page flag to every WX route; the plugin does not inject these Page settings. Other targets do not need this WX-specific flag.

Template refs, layout/passive effects and class mount callbacks may run during the synchronous data callback before native onLoad. `Current.router` describes the incoming route while `Current.page` is not yet bound to the new native instance. WX DOM attachment also supplies the native Page receiver and binds its root context; native Page options and business load callbacks belong to native onLoad. Native navigation failures before instance creation perform no React mount. Cold entry, direct native navigation and Taro navigation share this creation path. Retained tabs are not recreated.

Native DOM root updates attach the Page root and flush its queued update callbacks. Template roots serialize and deliver native `setData` batches through Taro's scheduler.

Mount-completion delivery is O(1); Taro retains one load barrier per live native Page. Framework mount deduplication is O(Q + P) for Q queued and P rendered Pages; unmount retains upstream O(P) behavior. Initial serialization is O(A + N) for the App and destination Page hosts, in addition to React rendering cost. Native bridge updates retain Taro's existing mutation queue and asynchronous scheduler; no extra full `page.cn` payload is added.

## Development host attributes

`06-development-element-attributes` checks ordinary host-attribute values with React's `isValidElement` before writing them. Development rendering omits direct React elements, preventing their owner Fibers from entering initial hydration or incremental native payloads. A valid-to-element transition clears the previous attribute. A warning names the attribute when it first receives an element; consecutive element values neither warn again nor mutate the host. Component props, React children, events, styles and ordinary object/array attributes retain their existing paths.

The check is O(1), performs no recursive traversal or cloning, and allocates no bookkeeping state. Nested values are not inspected. The entire branch is guarded by `process.env.NODE_ENV !== 'production'`, so production builds erase its checks and warnings. React 19, its development reconciler and Fast Refresh remain unchanged.

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
pnpm patches:build @tarojs/runtime@4.3.1
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
pnpm patch @tarojs/runtime@4.3.1 --ignore-existing --edit-dir "$work/package"
git -C "$work/package" init --quiet --object-format=sha1
git -C "$work/package" -c core.autocrlf=false add --force --all

# For a later feature, apply all earlier feature files here with git apply --index.
base="$(git -C "$work/package" write-tree)"
feature="$repo/patches/series/@tarojs__runtime@4.3.1/01-mini-app-page-rendering.patch"
git -C "$work/package" apply --index "$feature"

# Edit the extracted package files now. For a new feature, omit the preceding apply.
# Do not apply subsequent features before capturing this feature's diff.
git -C "$work/package" -c core.autocrlf=false add --force --all
git -C "$work/package" diff --cached --binary --full-index \
  --no-color --no-ext-diff --no-textconv --no-renames \
  --src-prefix=a/ --dst-prefix=b/ "$base" -- > "$feature"

pnpm patches:build @tarojs/runtime@4.3.1
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
