# Visible App wrap for WX

## Status

Implemented in the WX compiler/runtime and exercised by the permanent native-component fixture. Static tests, production
WX/H5 builds, depth-16 slot forwarding, granular `app.*`/`page.*` paths, retained-Page navigation, native components, and
App HMR state retention are validated. Broader device profiling of object-property propagation remains a release benchmark,
not an architectural blocker.

The implementation uses a native virtual-host component and slot. It does not forward Page data through App WXML, merge
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

Patch the generated WX Taro runtime at the two outlet behavior sites:

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

## Chosen design: Page-owned transparent App fragment

Keep Taro's recursive `comp` implementation and configuration unchanged. The generated Page WXML binds both native data
roots and passes `app` to `comp` as one ordinary compact node. Its child is the Page-owned template slot.

### Native data

The App root is a private transparent compact record; only its `cn` array changes:

```ts
Page.data = {
    app: {
        nn: 'vpt_fragment',
        cn: [/* compact App-wrap records */]
    },
    page: {
        cn: [/* compact records for this Page */]
    }
}
```

`nn` is required only because generic `comp` dispatches one input record through `i.nn`; `vpt_fragment` transparently adapts
the arbitrary App root collection to that contract. The synthetic record is not a Taro host or keyed/event-addressable
child, so it intentionally has no `sid`. Its `cn` entries are real Taro records and retain their stable `sid` as the
fragment loop's `wx:key`, matching stock root rendering. Only `app.cn` participates in native updates.

### Direct App and Page paths

Both the document App host and React Page hosts are `TaroRootElement` schedulers. Their structural parent selects the native
data namespace while `nodeName` remains `root` for Taro host and event semantics:

```ts
get _path() {
    return this.parentNode?.nodeName === 'container' ? 'app' : 'page'
}
```

The App root is the only root directly below the document container; Page roots live below `vpt_page_outlet`. Descendants
therefore derive direct `app.*` or `page.*` paths without instance overrides or path translation. Taro 4.2.1 also names two
initial Page-array reset paths explicitly:

```ts
initRender
    ? ['page.cn.[0]', 'page.cn[0]']
    : []
```

### Parent Page WXML

Current Page entry:

```xml
<template is="taro_tmpl" data="{{root:root}}" />
```

Generated Page entry:

```xml
<import src="../../base.wxml" />

<comp i="{{app}}">
  <template is="taro_tmpl" data="{{root:page}}" />
</comp>
```

The Page owns the `app` and `page` bindings. `comp` receives the same generic `i` property it has always rendered; it has no
App data property, root mode, slot mode, or App/Page branch.

### Transparent App root and outlet

The private fragment template renders `app.cn` without a native node:

```xml
<template name="tmpl_0_vpt_fragment">
  <template
    is="{{xs.a(0, item.nn, '')}}"
    data="{{i:item,c:1,l:xs.f('',item.nn)}}"
    wx:for="{{i.cn}}"
    wx:key="sid"
  />
</template>
```

App hydration still stops at the private outlet marker:

```text
Page.data.app
└─ vpt_fragment
   └─ App View
      ├─ Header
      ├─ { nn: 'vpt_page_outlet', cn: [] }
      └─ Footer
```

The outlet consumes the Page-owned default slot:

```xml
<template name="tmpl_0_vpt_page_outlet">
  <slot />
</template>
```

### Depth-15 slot forwarding

Taro's depth-reset `comp` remains generic. Its generated invocation simply forwards whatever default slot its caller owns:

```xml
<comp i="{{i}}" l="{{l}}">
  <slot />
</comp>
```

`l` is Taro's stock WXS lineage for bounded/nestable component aliases and remains part of the generic depth-reset contract.
The new Page-root `comp` omits it because that call has no ancestor lineage and the property defaults to `''`. No Page object
or mode scalar crosses recursive template calls. Page-side recursion forwards an empty slot; App-side recursion forwards the
Page template until the outlet consumes it.

### Native-component ownership

`comp.json` remains unchanged and registers only recursive `comp`. `app.json` registers every generated native-component
mapping and asynchronous placeholder once, making them available across WXML owners. Page JSON preserves explicit Page
configuration and adds only the Page-local root `comp` registration.

### Native result

```text
WX native tree A                      WX native tree B

App native nodes                      App native nodes
├─ Header                             ├─ Header
├─ Page A native nodes   [slot]       ├─ Page B native nodes   [slot]
└─ Footer                             └─ Footer
```

The fragment, virtual `comp`, and outlet add no native layout node.

## Verified WeChat platform behavior

The permanent fixture validates:

```text
1. comp.wxml and comp.json remain free of App/Page properties and branches.
2. A depth-16 App wrap forwards the Page slot through recursive comp.
3. Page-only updates report only page.* paths.
4. App-only updates report only granular app.* paths.
5. Context and App state survive two retained native Pages and back navigation.
6. A native component rendered by app.tsx resolves through app.json while comp.json remains unchanged.
```

## App scheduler

Create the document's existing `#app` host as a `TaroRootElement` instead of a plain `TaroElement`. It remains React's one
host container and also supplies Taro's normal batching queue; no detached scheduler node is needed.

The structural parent selects the native namespace:

```ts
get _path() {
    return this.parentNode?.nodeName === 'container' ? 'app' : 'page'
}
```

The App root is the only root directly below the document container. Page roots remain below `vpt_page_outlet`. Framework
initialization assigns only the App root's native sink:

```ts
appRoot.ctx = {
    setData(data, callback) {
        const pages = getCurrentPages()
        const currentPage = pages[pages.length - 1]

        if (!currentPage) {
            callback()
            return
        }

        pages.forEach((page) => {
            page.setData(data, page === currentPage ? callback : undefined)
        })
    }
}
```

```text
App TaroRootElement._root ─────► itself ──► app.* fan-out
                                           ├─ native Page A.setData(app delta)
                                           └─ native Page B.setData(app delta)

Page A TaroRootElement._root ──► itself ──► native Page A.setData(page delta)
Page B TaroRootElement._root ──► itself ──► native Page B.setData(page delta)
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
    value: () => hydrate(container).cn
})
```

Existing Taro logic then connects `pageRoot.ctx` and drains one batch:

```text
page.* + app.cn → one native Page.setData()
```

The Page constructor starts with:

```ts
{
    app: { nn: 'vpt_fragment', cn: [] },
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
      ├─ Page-owned virtual comp renders App data
      └─ parent Page template fills the App slot from page data
```

### Page-local update

```text
Page setState()
└─ React reconciles that Page Fiber
   └─ Page Taro root emits page.* to that native Page
      └─ parent Page WXML updates slotted Page nodes
         └─ root comp.i does not change
            └─ App templates do not depend on the Page update
```

### App update

```text
App setState()
└─ React reconciles singleton App once
   └─ App Taro nodes emit app.*
      └─ App Taro root mirrors one delta to each mounted Page
         └─ Page-owned virtual comp updates App templates
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

Context, error boundaries, Suspense, state, effects, and refs follow this one tree. Native WXML only renders already
reconciled host data.

### Native ownership

Page WXML owns the `app`/`page` binding. Generic `comp` dispatches the compact `i` record, while slotted Page WXML remains
owned by the parent native Page configuration. App host events use the component's existing `eh`; Page host events use the
Page's `eh`. Taro `sid` values still resolve against one global event source.

### Native visual nesting

The component's `virtualHost` removes its native layout box. The outlet emits `<slot>` directly. Native order is therefore
Header → local Page → Footer, matching App JSX.

### Hidden Pages

Each mounted Page stores its own `page` data and one `app` mirror. Real App updates fan out to hidden surfaces. Returning
to a hidden Page needs no `onShow` synchronization or active-Page tracker.

### H5

H5 keeps ordinary Fragment children and browser DOM rendering. It receives no WX outlet, native `comp`, App scheduler, or
`{ app, page }` data contract. The generated runtime package leaves its H5 `runtime.esm.js` entry unchanged.

## Performance

Let `W` be App compact size, `Rᵢ` Page compact size, and `P` mounted Pages.

```text
React App instances:             1
React Page instances:            P
Native virtual comp instances:   P plus ordinary depth-reset instances
Parent Page app storage:         O(P × W)
Component i storage:             up to O(P × W), platform implementation dependent
Native Page storage:             O(sum Rᵢ)
Page-local bridge work:          O(delta Rᵢ)
Page-local App-template work:    O(0)
App bridge work:                 O(P × delta W)
App component work:              O(P × delta W) ideal; O(P × W) conservative
New Page App seed:               O(W)
Page-root insertion bridge:      O(0)
```

Let `delta A` and `delta Rᵢ` be the serialized App and Page payloads for one batch, `U` the number of Taro payload paths
coalesced by that batch, and `B` the number of depth-reset `comp` boundaries crossed before the outlet.

### Per-update cost model

| Update | React/Taro work | Native calls | Bridge bytes | WXML consequence |
| --- | --- | --- | --- | --- |
| Page leaf update | Reconcile the affected Page Fiber subtree; one Page root batches its changed paths | 1 `Page.setData()` | `O(delta Rᵢ)` | Only `page.*` dependencies update; `comp.i === app` is unchanged |
| Page structural update | Same root, but Taro may replace a sibling `cn` array according to its normal insertion heuristic | 1 | Between `O(delta Rᵢ)` and `O(Rᵢ)` | Same as baseline Taro Page array replacement through one outer slot |
| App leaf update | Reconcile singleton App hosts once; App root coalesces `U` paths, then enumerates `P` native Pages | `P` | `O(P × delta A)` | Every Page's App templates update; component propagation is granular ideally and `O(W)` per Page conservatively |
| App structural update | Taro may hydrate/replace an App `cn` array, so the payload can grow from one subtree to all siblings | `P` | Between `O(P × delta A)` and `O(P × W)` | Same App-property uncertainty, multiplied by every retained Page |
| State update with identical host output | React reconciliation only; no Taro payload is enqueued | 0 | 0 | No native work |
| Context update consumed only by Pages | Reconcile affected consumers; each affected Page root batches independently | Up to `P` | `O(sum delta Rᵢ)` | Page templates only |
| Context update consumed by App and Pages | One App batch plus each affected Page batch | Up to `2P` | `O(P × delta A + sum delta Rᵢ)` | App and Page partitions update independently; the current Page can receive two `setData()` calls |
| First mount of a native Page | Commit its React Page root, hydrate the current App hosts once, and add both payloads to the pending initial Page queue | 1 | `O(W + Rᵢ)` | App and Page appear atomically; one virtual root `comp` and `B` depth components instantiate |
| Navigation push after React commit | Outlet child insertion changes only the in-memory ownership tree; initial Page seeding handles native data | 0 App calls, then the one initial Page call above | No App insertion payload | Existing Pages are untouched |
| Navigation pop | Normal React/Taro removal and event-source cleanup for the unloaded Page; outlet propagation is suppressed | 0 App calls | 0 App bytes | Remaining surfaces are untouched and future fan-out uses `P - 1` Pages |
| App update with no mounted Page | App root still coalesces its in-memory hosts; fan-out completes immediately | 0 | 0 | The next Page receives the latest full snapshot |

Taro's existing root batching drains its payload array with repeated `shift()`, giving a theoretical `O(U²)` worst case,
then checks up to `C` child-array reset paths against each retained path for `O(U × C)`. The feature changes neither step and
adds no queue or path translation. App updates add the `O(P)` stack enumeration and native calls after that existing batch;
Page updates do not.

### Constant overhead introduced by the patches

- The document's existing App container becomes a `TaroRootElement`. This adds one root queue and `ctx` reference but no
  extra node, React root, or native layout element.
- `TaroRootElement._path` performs one parent-name comparison whenever a root path is requested. This is `O(1)` and replaces
  the former constant return; descendant path construction is otherwise unchanged.
- `TaroNode.enqueueUpdate()` performs one outlet-name comparison for every host update. Only outlet child mutations return
  early; that constant branch prevents a navigation change from becoming an `app.*` fan-out.
- `hydrate()` performs one outlet-name comparison per visited App record. At the outlet it terminates traversal, avoiding
  `O(sum Rᵢ)` Page serialization and the much larger `O(P × sum Rᵢ)` native duplication that traversal would cause.
- `vpt_fragment` iterates the App's top-level compact records once and emits no node. Its cost is `O(N)` for `N` App roots,
  which is the collection dispatch generic `comp` otherwise cannot express.
- The outer virtual `comp` adds one native component context per Page. Slot forwarding adds no JavaScript bridge call or
  data copy; a depth-`D` App wrap creates the same Taro reset components plus `B` forwarded slot boundaries, roughly one
  per 15 host levels.
- `broadcastAppUpdate()` calls `getCurrentPages()` once and dispatches `P` `setData()` calls. Only the current Page receives
  the completion callback, avoiding `P` callback closures or a mutable fan-in counter; it does not wait for every hidden
  surface's render callback before Taro completes the App batch.

### Current DevTools observation

A WeChat DevTools simulator run against the permanent native-component fixture used one mounted Page and an App outlet below
16 host levels. `setUpdatePerformanceListener({ withDataPaths: true })` reported:

| Interaction | Samples | Native batches per interaction | Paths per batch | Median queue | Median process | Median total | Maximum total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| App-host-only state | 20 | 1 `app.*` | 2 | 4 ms | 2 ms | 6 ms | 9 ms |
| Page-only state | 20 | 1 `page.*` | 3 | 2 ms | 1 ms | 2.5 ms | 4 ms |
| Context rendered by App and Page | 10 | 1 `app.*` + 1 `page.*` | 1 each | 3 ms / 3 ms | 2 ms / 1 ms | 4.5 ms / 4 ms | 5 ms / 6 ms |

“Queue” above is `pendingStartTimestamp -> updateStartTimestamp`; it does not include React reconciliation or Taro's
scheduled delay before `Page.setData()` enters the native listener. These numbers are diagnostics, not a baseline benchmark:
they are simulator timings from one machine, payload shapes differ, and Page-level data paths do not reveal whether WeChat
copied or reevaluated the complete `comp.i` property internally. A release benchmark must compare the same fixture against
upstream Taro on device for shallow, wide, depth-14, depth-15, and
multi-boundary App shapes. Until that test exists, only bridge-call counts, payload paths, asymptotic costs, and Page/App
isolation are established.

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
Page mount:      one App snapshot and one ordinary virtual comp instance
App update:      one delta per native Page plus component-property rendering
Native storage:  one App mirror per Page and possibly one component property copy
Static WXML:     transparent-fragment and outlet templates plus one slot at the depth boundary
```

### App component property granularity

The parent Page binds one object property:

```xml
<comp i="{{app}}">
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
└─ component receives/reevaluates complete i             O(W)
```

A Page-level performance listener showing a granular `app.*` path does not prove granular component work. The disposable
observer proved Page/App isolation, not this granularity. Permanent profiling must use shallow, wide, and deeply nested App
wraps.

If App updates are materially coarse, a later design may target native component instances directly or justify a merged
native tree. Do not add either mechanism without measurements.

### Native component boundary costs

One virtual `comp` per Page adds a native component context, property storage, WXML scope, and event method. It adds no
layout node. Generated native components and asynchronous placeholders use one global `app.json` registration so their tags
resolve across WXML owners. The root `comp` remains Page-local, and explicit user Page registrations remain untouched.

## Minimum implementation changes

### Patched framework React runtime

Update:

```text
patches/@tarojs__plugin-framework-react@4.2.1-react19.patch
```

Keep the ordinary four-argument `createReactApp()` API. Its existing Mini Program branch:

- uses the existing App host as a `TaroRootElement` with direct `app.*` paths;
- assigns its native sink to fan out App batches;
- renders Page elements below the fixed private `vpt_page_outlet` host;
- fans each batched `app.*` delta out to mounted native Pages;
- lazily seeds `app.cn` before each Page's existing initial callback continues.

The existing web branch retains its Fragment children and never executes the Mini Program scheduler code. Do not add a
portal, detached Page container, Page registry, active-Page tracker, lifecycle synchronizer, or custom pending queue.

### Patched Taro runtime package

Generate `vite-plugin-taro-runtime` from the upstream `@tarojs/runtime@4.2.1` tarball and
`../patches/@tarojs__runtime@4.2.1.patch` through `pnpm prepare:taro`, alongside the two existing patched Taro
packages. The patch changes exactly five sites in the modular WX browser entry:

```text
1. document App-host construction
2. hydrate() outlet child serialization
3. TaroNode.enqueueUpdate() forwarding
4. TaroRootElement._path
5. initial root.cn reset-path literals
```

The patched modules make the outlet opaque, suppress outlet-originated native updates, and emit direct `page.*` paths. The
plugin resolves every bare `@tarojs/runtime` import to this one package identity. `runtime.esm.js`, used by H5, remains the
upstream file. No build-time Taro source specialization is performed.

### Page data capsule

Initialize:

```ts
{
    app: { nn: 'vpt_fragment', cn: [] },
    page: { cn: [] }
}
```

### Generated Page WXML

Emit the stock recursive `comp` with `i="{{app}}"` and the parent-scoped Page template as its default slot.

### Shared template generation

- append transparent `tmpl_0_vpt_fragment`;
- append `tmpl_0_vpt_page_outlet` containing `<slot />`;
- place one unconditional `<slot />` inside Taro's existing depth-reset `comp` invocation;
- do not change ordinary recursive template data scopes;
- do not duplicate the template namespace;
- do not emit `page-base.wxml`.

### Recursive component capsule

Leave `component.ts`, `comp.wxml`, and `comp.json` at their generic Taro behavior. They contain no App/Page property, mode,
or branch.

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
11. `comp.wxml`, `component.ts`, and `comp.json` contain no App/Page distinction.
12. Page WXML alone binds `app` to generic `i` and `page` to the default slot.
13. No Page object is forwarded through App template scopes or component properties.
14. The native slot is consumed exactly once at the outlet.
15. Root and recursive `comp` instances are virtual hosts.
16. H5 behavior is unchanged.

## Validation

### Static and unit tests

- the runtime patch applies cleanly to exactly five intended Taro sites;
- App hydration stops before outlet children without hydrating Page subtrees;
- outlet insertion/removal preserves Taro host bookkeeping and emits no App sink call;
- Page roots emit `page.*` directly;
- App hosts emit `app.*` directly;
- generated Page WXML binds generic `comp.i` to the transparent App record and supplies the Page template as its slot;
- `component.ts`, `comp.wxml`, and `comp.json` contain no App-specific fields;
- no App template scope contains Page data;
- fragment and outlet templates emit no native wrapper;
- unconditional slot forwarding crosses depth-15 recursion;
- one template namespace is emitted.

### React semantics fixture

The permanent native-component fixture currently verifies with two retained Pages:

- App Context values appear in the visible Page and remain current after back navigation;
- `Taro.useLaunch()` and the App effect mount once across push/hide/show/pop;
- the App effect does not clean up during Page navigation;
- App state increments once and survives navigation;
- App-host-only state updates do not emit `page.*` paths;
- Page-local state updates do not emit `app.*` paths;
- a native component rendered by `app.tsx` receives App props.

Accepted App HMR state retention has been exercised manually. Explicit App/Page ref-remount assertions and automated
on-device lifecycle counters remain regression work rather than completed fixture coverage.

### WX rendering and isolation

- App native nodes visually surround slotted Page nodes;
- virtual hosts add no layout box;
- Page `setState()` emits only `page.*`;
- Page updates do not change the root `comp.i` property or App-template data;
- App `setState()` emits `app.*` once per mounted Page;
- initial `app + page` rendering is atomic;
- hidden App surfaces remain current;
- slot forwarding works through one and multiple depth-15 boundaries;
- Page and App controls dispatch to the correct React handlers;
- native-component props and slots retain semantics;
- console contains no recursive-template, property, slot, or runtime errors.

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

## Architecture acceptance criteria

The implemented architecture satisfies the structural criteria below; the on-device baseline and remaining automated
regressions listed above are release-validation work:

- App JSX visibly wraps every WX Page;
- one App Fiber preserves Context, state, effects, refs, and reconciliation;
- no React portal or second React root exists;
- no Page data is threaded through App WXML scopes;
- Page-local updates do not invalidate App templates or generic `comp.i`;
- App updates remain acceptably granular across the component-property boundary;
- every native Page renders only its own slotted `page` data;
- App and Page events, styles, selectors, refs, and native components retain semantics;
- depth-15 slot forwarding is correct;
- Page mount/unmount emits no native App child-list update;
- one static WXML namespace is emitted;
- H5 is unchanged;
- the complete regression and performance matrix is run before release.
