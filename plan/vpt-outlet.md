# Visible App wrap for WX

## Status

Design plan only. The repository remains on current Taro behavior until this plan is implemented and validated.

The chosen design uses a native virtual-host component and slot. It does not forward Page data through App WXML, merge
App and Page data paths, create a React portal, or instantiate App once per Page.

## Goal

Render ordinary JSX from `app.tsx` around every WX Page while using the same App implementation for H5:

```tsx
import Taro from 'virtual:taro/api'
import { Button, Text, View } from 'virtual:taro/components'
import { createContext, type PropsWithChildren, useEffect, useMemo, useState } from 'react'

type AppContextValue = Readonly<{
    effectReady: boolean
    wrapCount: number
}>

export const AppContext = createContext<AppContextValue>({
    effectReady: false,
    wrapCount: -1
})

function App({ children }: PropsWithChildren) {
    // Visible singleton state must survive Page navigation and accepted App HMR updates.
    const [wrapCount, setWrapCount] = useState(0)
    // Effect-owned state makes App effect completion observable from the wrap and every Page consumer.
    const [effectReady, setEffectReady] = useState(false)

    Taro.useLaunch(() => {
        console.log('[vpt-wrap] launch')
    })

    useEffect(() => {
        console.log('[vpt-wrap] effect mount')
        setEffectReady(true)

        return () => {
            console.log('[vpt-wrap] effect cleanup')
        }
    }, [])

    const contextValue = useMemo(
        () => ({ effectReady: effectReady, wrapCount: wrapCount }),
        [effectReady, wrapCount]
    )

    return (
        <AppContext.Provider value={contextValue}>
            <View className="app-wrap">
                <Text id="app-wrap-state">{`wrap:${wrapCount};effect:${String(effectReady)}`}</Text>
                <Button id="app-wrap-increment" onClick={() => setWrapCount((count) => count + 1)}>
                    Increment App wrap
                </Button>
                {children}
            </View>
        </AppContext.Provider>
    )
}
```

Every test Page consumes `AppContext` and renders both values. The default `wrapCount: -1` makes a broken provider
relationship directly observable.

The implementation must preserve:

- one React root and one singleton App Fiber;
- ordinary App-to-Page React ancestry, Context, error boundaries, Suspense, state, effects, refs, and reconciliation;
- one independent Taro root and native scheduler per mounted WX Page;
- Page state across hide/show and back navigation;
- granular App and Page native updates;
- unchanged H5 rendering.

## Vocabulary and runtime layers

### React-only and host Fibers

React components and Context do not become Taro nodes. They remain Fibers and perform React work. Only host Fibers invoke
the Taro renderer:

```text
React Fiber and host materialization

App                                        [function Fiber: hooks/state/effects]
└─ AppContext.Provider                    [provider Fiber: propagates Context]
   └─ View                                [HostComponent Fiber]
      │                                     └─ createInstance('view') ──► TaroElement('view')
      ├─ Header                           [component Fiber]
      │  └─ Text                          [HostComponent Fiber]
      │     │                               └─ createInstance('text') ──► TaroElement('text')
      │     └─ HostText Fiber             ─────────────────────────────► TaroText
      └─ PageWrapper                      [class Fiber]
         └─ root                          [HostComponent Fiber; not a React root]
            │                               └─ createInstance('root') ──► TaroRootElement
            └─ Page                       [component Fiber]
               └─ Page host Fibers        ─────────────────────────────► Page Taro nodes
```

“App hosts” are `TaroElement` and `TaroText` objects produced before traversal enters a Page's `TaroRootElement`. This
includes host output from App-side components such as Header and Footer, but not those components' Fibers.

### Compact native data

WeChat WXML cannot read live Taro objects. Taro's `hydrate()` converts them to compact serializable records:

```text
In-memory Taro objects                         Native Page data

TaroRootElement.childNodes
└─ TaroElement('view')             hydrate()   Page.data.root.cn
   └─ TaroElement('text')          ─────────►  └─ compact view record
      └─ TaroText('Hello')                       └─ compact text record
                                                    └─ compact text-value record
```

A simplified compact result is:

```ts
Page.data.root.cn = [
    {
        nn: '3',
        sid: '_A',
        cl: 'page',
        cn: [
            {
                nn: '5',
                sid: '_B',
                cn: [{ nn: '9', sid: '_C', v: 'Hello' }]
            }
        ]
    }
]
```

The short fields are Taro's WXML data protocol:

```text
cn   child records
nn   generated node/template alias
sid  stable Taro node identity used by events
cl   class name
v    text value
```

The numeric aliases depend on Taro's generated component table.

### Three distinct trees

The design must not conflate:

```text
React Fiber tree        component ownership, hooks, Context, reconciliation
Taro host tree          live JavaScript TaroElement/TaroRootElement objects
WX native view tree     nodes instantiated by one native Page's WXML
```

## Current Taro behavior

### Current React Fiber tree

Taro already renders App and every Page retained by the native navigation stack in one React root:

```text
ReactRoot                                      [one HostRoot Fiber]
└─ AppWrapper                                  [class Fiber]
   └─ App                                      [function Fiber]
      └─ AppContext.Provider                   [provider Fiber]
         └─ View                               [host Fiber]
            ├─ App host Fibers
            ├─ PageWrapper A
            │  └─ root                         [host Fiber; not ReactRoot]
            │     └─ Taro PageContext.Provider
            │        └─ Page A
            │           └─ Page A render subtree
            └─ PageWrapper B
               └─ root                         [host Fiber; not ReactRoot]
                  └─ Taro PageContext.Provider
                     └─ Page B
                        └─ Page B render subtree
```

`PageWrapper.render()` currently returns:

```tsx
<root id={$taroPath}>
    <TaroPageContext.Provider value={$taroPath}>
        <Page />
    </TaroPageContext.Provider>
</root>
```

The host string `root` materializes one `TaroRootElement`; it does not call `ReactDOM.createRoot()`.

Multiple Page roots coexist:

```text
Native stack [A]       → Taro roots [A]
Native stack [A, B]    → Taro roots [A, B]
Native stack [A, B, C] → Taro roots [A, B, C]
navigateBack()         → Taro roots [A, B]
```

Two instances of one route also have separate roots because each receives a unique `$taroPath`.

### Current Taro host tree

React-only Fibers are omitted when host nodes are connected:

```text
App host container
└─ view                                  [TaroElement, class="app-wrap"]
   ├─ text                               [App TaroElement]
   ├─ button                             [App TaroElement]
   ├─ TaroRootElement A
   │  └─ Page A Taro nodes
   └─ TaroRootElement B
      └─ Page B Taro nodes
```

The App-owned Taro nodes already exist today because the renderer materializes every host Fiber. If App returned only
`{children}`, those App-owned host nodes would not exist.

The App nodes have no `TaroRootElement` ancestor, so `_root` resolves to null and their mutations remain in memory. Each
Page root returns itself from `_root`. `createPageConfig()` assigns the native Page instance to `pageRoot.ctx`, so Page
updates reach only that Page's `setData()`.

### Current native WX trees

WX does not render the complete Taro host tree. Every native Page is an independent WXML surface:

```text
WX native view tree A                 WX native view tree B

Page A native nodes                   Page B native nodes
```

App `view`, `text`, and `button` nodes are absent from both native surfaces.

### Current Page WXML

Current Page data contains one Page tree:

```ts
Page.data = {
    root: {
        cn: [/* compact records hydrated from this Page's Taro nodes */]
    }
}
```

The generated Page invokes Taro's shared entry template:

```xml
<import src="../../base.wxml" />
<template is="taro_tmpl" data="{{root:root}}" />
```

The left `root` is the local variable expected by `taro_tmpl`; the right `root` is `Page.data.root`.

The shared entry iterates compact children and dispatches by `nn`:

```xml
<template name="taro_tmpl">
  <template
    is="{{xs.a(0, item.nn, '')}}"
    data="{{i:item,c:1,l:xs.f('',item.nn)}}"
    wx:for="{{root.cn}}"
    wx:key="sid"
  />
</template>
```

A generated host template renders one native node and recursively dispatches its compact children:

```xml
<template name="tmpl_0_3">
  <view class="{{i.cl}}" style="{{i.st}}">
    <template
      is="{{xs.a(c, item.nn, l)}}"
      data="{{i:item,c:c+1,l:xs.f(l,item.nn)}}"
      wx:for="{{i.cn}}"
      wx:key="sid"
    />
  </view>
</template>
```

Current flow:

```text
Page React hosts
└─ Page TaroRootElement serializes root.*
   └─ Page.data.root
      └─ taro_tmpl(root)
         └─ generated tmpl_* recursion
            └─ WX Page native nodes
```

App data never enters this pipeline.

## The missing behavior

The feature needs each native Page to render:

```text
App wrap
├─ Header
├─ that native Page's own content
└─ Footer
```

It must not:

- instantiate App once per Page;
- create another React root;
- break Context by rendering Pages outside App;
- copy all mounted Page roots into every App mirror;
- remap every Page update under a movable App outlet path;
- force Page updates to reevaluate App templates.

## Why naive App serialization is wrong

The current App Taro tree contains every mounted Page root. Recursively hydrating the App would produce:

```text
Page.data.app = App hosts + Page A hosts + Page B hosts + ...
```

That value would be mirrored to every native Page even though each Page already stores its own Page data. For `P` mounted
Pages, native storage approaches:

```text
O(P × (App wrap + sum of all Page roots))
```

Hydrating complete Page subtrees and deleting them afterwards avoids retained data but still wastes traversal and
allocation.

## Stable React/Taro outlet

Add one private host node around the complete retained Page collection at the App's singular `{children}` position:

```text
React Fiber tree

App
└─ App hosts
   └─ vpt_page_outlet                 [host Fiber]
      ├─ PageWrapper A
      │  └─ root                      [host Fiber]
      └─ PageWrapper B
         └─ root                      [host Fiber]
```

```text
Taro host tree

App host container
└─ App Taro nodes
   └─ vpt_page_outlet
      ├─ TaroRootElement A
      │  └─ Page A Taro nodes
      └─ TaroRootElement B
         └─ Page B Taro nodes
```

Taro already owns `childNodes`, parent links, ordering, insertion, removal, and event-source cleanup. The feature adds no
Page collection and does not reconstruct this information from native lifecycles.

### Opaque outlet serialization

The outlet remains complete in memory but serializes no Page-root children:

```text
Taro host tree                         Page.data.app

App hosts                              App compact records
└─ outlet                              └─ outlet record
   ├─ Page root A                         └─ cn: []
   └─ Page root B
```

Specialize pinned WX Taro runtime in two places:

```ts
// hydrate(): stop before Page roots
const children = nodeName === 'vpt_page_outlet'
    ? []
    : node.childNodes.filter(isRenderableNode).map(hydrate)
```

```ts
// TaroNode.enqueueUpdate(): keep host bookkeeping, suppress native outlet-child updates
if (this.nodeName === 'vpt_page_outlet') return
this._root?.enqueueUpdate(payload)
```

The outlet is the stable App-data marker for `{children}`. Page push/pop changes happen behind it and do not shift App
compact-array indices or produce App bridge updates.

### Why not use Page roots as markers

Page roots themselves could be compact markers:

```text
view.cn = [header, rootA, rootB, footer]
```

Each native Page could compare a root marker identity and render only its own Page. This avoids the extra outlet host but
makes every Page root part of every `app` shape.

The markers must stay synchronized because Taro paths use array indices:

```text
Before push B
view.cn = [header, rootA, footer]
                              └─ footer index 2

After push B
view.cn = [header, rootA, rootB, footer]
                                     └─ footer index 3
```

If Page A did not receive the `rootB` insertion, later footer updates would target index 3 while Page A still stored the
footer at index 2. Normal push/pop mutations would therefore fan out to every App mirror, every Page would store `P`
markers, and WXML would inspect `P` markers to find one Page.

One collection outlet keeps the parent shape stable:

```text
view.cn = [header, outlet, footer]
```

No explicit push/pop tracker is needed in either design; the outlet simply avoids turning existing host mutations into
native App-data mutations.

## Rejected Page-data forwarding design

An independent `{ app, page }` design can render App first and carry the complete Page data through every recursive App
scope:

```xml
<template is="taro_tmpl" data="{{root:app,p:page}}" />
```

```xml
data="{{i:item,c:c+1,l:xs.f(l,item.nn),p:p}}"
```

The outlet then loops over `p.cn`.

This keeps bridge paths granular but couples every Page-native update to App WXML:

```text
Page setState()
└─ setData(page.* delta)
   └─ Page.data.page changes
      └─ p-dependent App scopes may reevaluate
         └─ p is forwarded until the outlet
```

The extra work is between `O(D)` and `O(W)` per Page update, where `D` is outlet depth and `W` is App-wrap size. If the
App wrap crosses Taro's depth-15 `comp`, the complete Page object also crosses a native component property.

The one-character alias limits static size but not runtime dependency. Measured generated templates contain 128 `p:p`
scopes in a production fixture and 214 in the development stress fixture. Replacing `p` with `page` would add approximately
0.8–1.3 KB, but either name retains the unacceptable Page-to-App dependency.

This design is rejected.

## Rejected merged native tree

A Page-specific merged tree is possible:

```text
Page A data                         Page B data

App wrap                            App wrap
└─ outlet                           └─ outlet
   └─ Page A records                   └─ Page B records
```

It removes Page-data forwarding and lets WXML start from one root. It does not inherently duplicate Page records if the
combined tree is the only native representation.

However, current Page mutations emit paths relative to `TaroRootElement`. In a merged tree the value lives below the
current App outlet path:

```text
current Page path
page.cn.0.cn.1.v

merged location
page.cn.<App path>.cn.<outlet position>.cn.0.cn.1.v
```

The outlet can move when App reconciliation inserts, removes, or reorders App hosts. A merged renderer must:

- discover the current outlet path;
- translate every Page payload;
- preserve Taro's array-reset and native custom-component routing logic;
- coordinate App structural and Page updates from one React commit;
- rebuild or preserve Page content when an App ancestor array is replaced;
- compose the initial Page-specific native tree.

This is a general renderer/path-coordination architecture. It may be worthwhile only if simpler native approaches fail
profiling or semantics. It is not the minimum change.

## Rejected React portal

A React portal can keep Page roots out of App hydration, but it changes physical Taro parentage:

```text
React ancestry:      App → outlet → Portal → Page
Taro host parentage: detached container → Page root
```

Context remains valid, but Taro `parentNode`, subtree traversal, MutationObserver behavior, and the in-memory topology no
longer match normal App-to-Page nesting. The plan keeps ordinary children and adds no `HostPortal` Fiber or detached Taro
container.

## Chosen design: virtual-host App surface with a Page slot

Render App compact data inside Taro's existing recursive `comp` custom component. `comp` already uses `virtualHost: true`,
so it adds no native layout node. Render the Page's normal WXML as the component's default slot.

The key separation is:

```text
Component-owned WXML scope    reads Page.data.app
Parent Page WXML scope        reads Page.data.page and supplies slot content
```

A `page.*` update changes the parent-scoped slot without changing the component's App property. No Page object appears in
App template scopes.

### Native data

Use descriptive top-level keys:

```ts
Page.data = {
    app: {
        cn: [/* compact App-wrap records */]
    },
    page: {
        cn: [/* compact records for this Page */]
    }
}
```

### Direct Page path names

Keep the Taro host type and `TaroRootElement.nodeName` as `'root'`; they identify the host and event boundary. Patch only
its native data path:

```ts
get _path() {
    return 'page'
}
```

Taro 4.2.0 also names two initial reset paths explicitly:

```ts
initRender
    ? ['page.cn.[0]', 'page.cn[0]']
    : []
```

These two edits make initial and steady Page updates emit `page.*` directly. There is no adapter or per-update path
translation. The scheduler-only App root's own `_path` is irrelevant because App payload paths originate from the App host
container's explicit path `app`.

### Parent Page WXML

Current Page entry:

```xml
<template is="taro_tmpl" data="{{root:root}}" />
```

Proposed Page entry:

```xml
<import src="../../base.wxml" />

<comp app-root="{{true}}" slot-mode="{{true}}" app-data="{{app}}">
  <template is="taro_tmpl" data="{{root:page}}" />
</comp>
```

The Page template remains in the parent Page WXML scope, where `page` is directly available. Its generated host templates,
events, props, recursive rendering, and `page.*` paths remain normal Taro behavior.

Both the parent Page and `comp.wxml` import the same `base.wxml` namespace. This does not recreate the earlier recursive
call problem: App `taro_tmpl` runs inside the custom component's WXML context, while Page `taro_tmpl` runs as caller-owned
slot content in the parent Page context. The native component boundary separates their active template call stacks, so no
second renamed namespace is needed.

### Root App mode in existing `comp`

Extend existing `comp.wxml` rather than add another native component kind:

```xml
<block wx:if="{{appRoot}}">
  <template is="taro_tmpl" data="{{root:appData,s:slotMode}}" />
</block>

<block wx:else>
  <template
    is="{{'tmpl_0_' + i.nn}}"
    data="{{i:i,c:1,l:xs.f('',i.nn),s:slotMode}}"
  />
</block>
```

Root mode renders `Page.data.app` received through `appData`. Existing recursive mode renders the normal `i` subtree.

The existing recursive component config gains:

```text
appRoot   boolean selecting root App mode
slotMode  boolean indicating that recursion carries the Page slot
appData   object containing compact App data
```

The component already supplies virtual-host behavior and the `eh` method required by App host events.

### App outlet template

The compact App tree contains one private marker:

```text
Page.data.app.cn
└─ App View
   ├─ Header
   ├─ { nn: 'vpt_page_outlet', cn: [] }
   └─ Footer
```

Its generated template emits only the component slot:

```xml
<template name="tmpl_0_vpt_page_outlet">
  <slot />
</template>
```

The slot inserts parent-scoped Page WXML exactly at `{children}`. It emits no native wrapper.

### Depth-15 slot forwarding

The root App component owns the Page slot. If App recursion crosses Taro's existing depth-15 `comp` boundary before the
outlet, the slot must cross that native component boundary.

Carry one stable generated scalar `s` through recursive scopes:

```xml
data="{{i:item,c:c+1,l:xs.f(l,item.nn),s:s}}"
```

Forward the slot only in App slot mode:

```xml
<comp i="{{i}}" l="{{l}}" slot-mode="{{s}}">
  <slot wx:if="{{s}}" />
</comp>
```

`Page.data.page` is never assigned to `s` or to a component property. Ordinary Page recursion does not provide `s`; App
recursion provides one stable boolean. A Page update cannot change it.

### Native result

```text
WX native tree A                      WX native tree B

App native nodes                      App native nodes
├─ Header                             ├─ Header
├─ Page A native nodes   [slot]       ├─ Page B native nodes   [slot]
└─ Footer                             └─ Footer
```

The root `comp` is a virtual host, and the outlet emits only `<slot>`, so neither adds a layout node.

## Verified WeChat platform behavior

A disposable native fixture established the platform primitives before choosing this design:

```text
1. <slot> inside a component WXML <template> renders caller content.
2. Caller content generated by <template is="..."> retains the parent Page data scope.
3. setData(page.*) updates slotted Page content without triggering the App-property observer.
4. setData(app.*) triggers the App property and leaves Page data unchanged.
5. A virtual child component can receive and forward the slot through another <slot>.
6. No slot, property, or runtime warnings occur in these flows.
```

These observations prove Page/App dependency isolation. They do not prove App-property update granularity; permanent tests
must measure that separately.

## App scheduler

App hosts currently resolve `_root` to null. Reuse Taro's existing batching logic with one scheduler-only
`TaroRootElement`:

```ts
const appScheduler = document.createElement('root')

appScheduler.ctx = {
    setData(data, callback) {
        const pages = getCurrentPages()
        const visiblePage = pages[pages.length - 1]

        if (!visiblePage) {
            callback()
            return
        }

        pages.forEach((page) => {
            page.setData(data, page === visiblePage ? callback : undefined)
        })
    }
}

Object.defineProperties(appHostContainer, {
    _path: { get: () => 'app' },
    _root: { get: () => appScheduler }
})
```

The scheduler is not appended to the Taro host tree and is not a React root. It contributes only Taro's existing update
queue, path batching, callback batching, and scheduled flush.

```text
Scheduler relationships, not host parentage

App-side TaroElement._root ─────► appScheduler
                                  └─ app.* batch
                                     ├─ native Page A.setData(app delta)
                                     └─ native Page B.setData(app delta)

Page A TaroRootElement._root ───► itself ──► native Page A.setData(page delta)
Page B TaroRootElement._root ───► itself ──► native Page B.setData(page delta)
```

Only App state that changes App host output produces `app.*`. Context-only or identical-output updates produce no native
App batch.

## Atomic initial Page data

A new Page root queues initial Page host payloads before `createPageConfig()` assigns its native `ctx`. The React
`forceUpdate()` callback is the point where the Page root exists but its initial queue has not flushed. Add one lazy App
payload:

```ts
pageRoot.enqueueUpdate({
    path: 'app.cn',
    value: () => hydrate(appHostContainer).cn
})
```

Existing Taro logic then connects `pageRoot.ctx` and drains one batch:

```text
page.* + app.cn → one native Page.setData()
```

The Page constructor starts with:

```ts
{
    app: { cn: [] },
    page: { cn: [] }
}
```

The WXML root component receives `app` while its simultaneously available child template receives `page`. No blank App
frame, custom queue, timer, Page-ready listener, or second initial `setData()` is added.

## Runtime flows

### First Page

```text
React commit
├─ creates App and Page host nodes
├─ app outlet retains Page root in Taro childNodes
├─ opaque outlet prevents Page-root serialization into app
├─ Page root queues page.*
└─ framework queues lazy app.cn
   └─ one initial native setData(app + page)
      ├─ root virtual comp renders App data
      └─ parent Page template fills the App slot from page data
```

### Page-local update

```text
Page setState()
└─ React reconciles that Page Fiber
   └─ Page Taro root emits page.* to that native Page
      └─ parent Page WXML updates slotted Page nodes
         └─ appData component property does not change
            └─ App templates do not depend on the Page update
```

### App update

```text
App setState()
└─ React reconciles singleton App once
   └─ App Taro nodes emit app.*
      └─ appScheduler mirrors one delta to each mounted Page
         └─ root virtual comp updates App templates
            └─ slotted Page data remains unchanged
```

### Navigation push

```text
React retains old Page Fibers and appends the new Page root below the outlet
├─ outlet child mutation emits no app.* update
├─ new Page queues its own page.* data
└─ new Page receives current app snapshot in its initial batch
```

Existing Pages need no navigation synchronization and keep current App mirrors.

### Navigation pop

React unmounts only the unloaded Page root. Taro performs normal child removal and event-source cleanup in memory. The
outlet suppresses the irrelevant native App child-list update. Remaining Page Fibers and native surfaces are untouched.

## Correctness

### React Context, state, effects, and refs

The native component and slot do not exist in the React Fiber tree. React ancestry remains:

```text
App
└─ Provider
   └─ App host Fibers
      └─ vpt_page_outlet
         └─ PageWrapper
            └─ Taro Page root host Fiber
               └─ Page Fiber subtree
```

Context, error boundaries, Suspense, state, effects, and refs follow this one tree. Native WXML only projects already
reconciled host data.

### Native ownership

The root App `comp` owns only App WXML. Slotted Page WXML remains owned by the parent native Page configuration. App host
events use the component's existing `eh`; Page host events use the Page's `eh`. Taro `sid` values still resolve against one
global event source.

### Native visual nesting

The component's `virtualHost` removes its native layout box. The outlet emits `<slot>` directly. Native order is therefore
Header → local Page → Footer, matching App JSX.

### Hidden Pages

Each mounted Page stores its own `page` data and one `app` mirror. Real App updates fan out to hidden surfaces. Returning
to a hidden Page needs no `onShow` synchronization or active-Page tracker.

### H5

H5 keeps ordinary Fragment children and browser DOM rendering. It receives no WX outlet, native `comp`, runtime
specialization, App scheduler, or `{ app, page }` data contract.

## Performance

Let `W` be App compact size, `Rᵢ` Page compact size, and `P` mounted Pages.

```text
React App instances:             1
React Page instances:            P
Native virtual App components:   P
Parent Page app storage:         O(P × W)
Component appData storage:       up to O(P × W), platform implementation dependent
Native Page storage:             O(sum Rᵢ)
Page-local bridge work:          O(delta Rᵢ)
Page-local App-template work:    O(0)
App bridge work:                 O(P × delta W)
App component work:              O(P × delta W) ideal; O(P × W) conservative
New Page App seed:               O(W)
Page-root insertion bridge:      O(0)
```

### Cost relative to current Taro

```text
Current Page update
page/root delta → normal Page templates

Feature Page update
page delta → same parent Page templates through one slot boundary
```

There is no Page-data forwarding through App scopes. The incremental Page-update cost is slot distribution only.

Feature-only costs are:

```text
Page mount:      one App snapshot and one virtual component instance
App update:      one delta per native Page plus component-property rendering
Native storage:  one App mirror per Page and possibly one component property copy
Static WXML:     outlet slot template plus stable scalar s plumbing
```

### App component property granularity

The parent Page binds one object property:

```xml
<comp app-data="{{app}}">
```

A granular parent update can remain:

```ts
page.setData({
    'app.cn.0.cn.1.v': '1'
})
```

The uncertain step is parent-to-component propagation:

```text
Ideal
app.cn.0.cn.1.v changes
└─ component reevaluates dependent App scopes only       O(delta W)

Coarse
app object is considered changed
└─ component receives/reevaluates complete appData       O(W)
```

A Page-level performance listener showing a granular `app.*` path does not prove granular component work. The disposable
observer proved Page/App isolation, not this granularity. Permanent profiling must use shallow, wide, and deeply nested App
wraps.

If App updates are materially coarse, a later design may target native component instances directly or justify a merged
native tree. Do not add either mechanism without measurements.

### Native component boundary costs

One virtual component per Page adds a native component context, property storage, WXML scope, and event method. It adds no
layout node. Selector/ref semantics across the component boundary and native-component declarations reachable from App JSX
must be treated as correctness requirements, not assumed free.

## Minimum implementation changes

### Patched framework React runtime

Update:

```text
patches/@tarojs__plugin-framework-react@4.2.0-react19.patch
```

Add:

- one private `vpt_page_outlet` host around WX Page elements;
- one scheduler-only App root at native path `app`;
- `app.*` fan-out to mounted native Pages;
- one lazy `app.cn` seed in each Page's existing initial batch.

Do not add a portal, detached Page container, Page registry, active-Page tracker, lifecycle synchronizer, or custom pending
queue.

### WX Taro-runtime specialization

Add one asserted source-mapped transform under the WX plugin. It must match exactly four pinned Taro 4.2.0 sites:

```text
1. hydrate() outlet child serialization
2. TaroNode.enqueueUpdate() forwarding
3. TaroRootElement._path
4. initial root.cn reset-path literals
```

The transform:

- makes the outlet opaque;
- suppresses outlet-originated native updates;
- emits Page paths at `page.*`;
- changes initial reset paths to `page.cn`;
- preserves one Taro runtime module identity;
- applies only to WX.

### Page data capsule

Initialize:

```ts
{
    app: { cn: [] },
    page: { cn: [] }
}
```

### Generated Page WXML

Emit the root virtual component and parent-scoped Page slot shown above. Keep one import of the existing shared base
namespace.

### Shared template generation

- append `tmpl_0_vpt_page_outlet` containing `<slot />`;
- add stable scalar `s` to recursive template scopes;
- forward slot and `s` through depth-15 `comp` calls;
- do not add Page data to App scopes;
- do not duplicate the template namespace;
- do not emit `page-base.wxml`.

Only standalone template `data` attributes may be augmented. Attributes such as `extra-data` must remain unchanged.

### Recursive component capsule

Extend existing `comp` config with root App mode, slot mode, and App-data properties. Keep existing virtual-host and event
behavior. Generate native-component declarations required by App templates at paths valid from root `comp.json`.

## Invariants

1. Exactly one React root owns App and all mounted Page Fibers.
2. Page wrappers remain ordinary descendants of App providers.
3. Exactly one private Taro outlet represents App `{children}`.
4. Every outlet child is a Taro Page root.
5. Taro remains the sole owner of outlet `childNodes`, parent links, and cleanup.
6. App hydration never traverses outlet Page roots.
7. Outlet child mutations never enter native `app.*` data.
8. Every Page root remains an independent scheduler emitting direct `page.*` paths.
9. App hosts emit direct `app.*` paths through one singleton scheduler.
10. Every native Page stores independent `{ app, page }` data.
11. Root `comp` WXML depends only on `app` and stable slot mode.
12. Parent Page WXML depends only on `page`.
13. No Page object is forwarded through App scopes or component properties.
14. The native slot is consumed exactly once at the outlet.
15. Root and recursive `comp` instances are virtual hosts.
16. H5 behavior is unchanged.

## Validation

### Static and unit tests

- runtime specialization matches exactly four intended Taro sites;
- App hydration stops before outlet children without hydrating Page subtrees;
- outlet insertion/removal preserves Taro host bookkeeping and emits no App sink call;
- Page roots emit `page.*` directly;
- App hosts emit `app.*` directly;
- generated Page WXML uses root `comp` and a parent-scoped `page` template;
- no App template scope contains Page data;
- outlet template contains only `<slot />`;
- stable slot mode and slot forwarding cross depth-15 recursion;
- one template namespace is emitted;
- `extra-data` and other non-scope attributes are unchanged.

### React semantics fixture

With at least two mounted Pages:

- App Context values appear in visible and hidden Pages;
- `[vpt-wrap] launch` runs exactly once across push/hide/show/pop;
- App effect mounts once and does not clean up during Page navigation;
- App state increments once and survives navigation;
- Page-local state survives hide/show and back;
- App and Page refs do not remount unexpectedly;
- accepted App HMR preserves nonzero App state and Context;
- React Refresh may rerun effects but does not retrigger native App launch.

### WX rendering and isolation

- App native nodes visually surround slotted Page nodes;
- virtual hosts add no layout box;
- Page `setState()` emits only `page.*`;
- Page updates do not trigger root `comp` App-property observers or App-template updates;
- App `setState()` emits `app.*` once per mounted Page;
- initial `app + page` rendering is atomic;
- hidden App surfaces remain current;
- slot forwarding works through one and multiple depth-15 boundaries;
- Page and App controls dispatch to the correct React handlers;
- native components, slots, styles, selectors, and refs retain semantics;
- console contains no recursive-template, property, slot, or runtime warnings.

Use `setUpdatePerformanceListener({ withDataPaths: true })`, component observers, and native update timing. Bridge paths and
component-internal work must be measured separately.

### Performance fixtures

Measure at least:

```text
App shapes
- shallow and narrow
- shallow and wide
- depth 14
- depth 15
- depth greater than 30 with multiple recursive comp boundaries

Update classes
- Page text leaf
- Page structural subtree
- App text leaf
- App structural subtree
- hidden Page App update
- rapid Page update burst
- rapid App update burst
```

Compare current Taro baseline, slot design, and—only if needed for diagnosis—the rejected `p` design.

### Regression matrix

Run:

- all plugin tests and workspace typechecks;
- WX and H5 production builds;
- Loan Genius navigation, forms, calculations, and full HMR suite;
- deep/burst/rebuild/recovery HMR stress tests;
- native custom-component props, events, slots, and updates;
- Towxml streaming/native integration;
- fresh generated-project WX and H5 builds;
- App source HMR with nonzero App state.

## Acceptance criteria

The design is accepted only when all are true:

- App JSX visibly wraps every WX Page;
- one App Fiber preserves Context, state, effects, refs, and reconciliation;
- no React portal or second React root exists;
- no Page data is threaded through App WXML scopes;
- Page-local updates do not invalidate App templates or `appData`;
- App updates remain acceptably granular across the component-property boundary;
- every native Page renders only its own slotted `page` data;
- App and Page events, styles, selectors, refs, and native components retain semantics;
- depth-15 slot forwarding is correct;
- Page mount/unmount emits no native App child-list update;
- one static WXML namespace is emitted;
- H5 is unchanged;
- the complete regression and performance matrix passes.
