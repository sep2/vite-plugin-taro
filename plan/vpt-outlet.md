# Visible App wrap for WX

## Goal

Allow ordinary JSX in `app.tsx` to visibly wrap every WX Page. The permanent semantics fixture must exercise App
Context, `Taro.useLaunch()`, state, and effects rather than testing only static JSX:

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
    // This visible state must survive Page navigation and accepted App HMR updates.
    const [wrapCount, setWrapCount] = useState(0)
    // This effect-owned state makes App effect completion observable in both the wrap and Page consumers.
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

Every test Page must consume `AppContext` and render both values in a stable selector. The default `wrapCount: -1` makes a
broken provider relationship directly observable rather than silently matching the initial App value.

The implementation must preserve Taro's current React and Page behavior:

- one React root;
- one singleton App Fiber;
- ordinary App-to-Page React ancestry and Context;
- one independent Taro root and `setData()` scheduler per mounted native Page;
- Page state across hide/show and back navigation;
- granular Page updates;
- unchanged H5 rendering.

“App hosts” is shorthand for the in-memory `TaroElement` and `TaroText` nodes produced by host JSX in the App side of
the tree, before traversal enters a Page's `TaroRootElement`. This includes host output from components such as `Header`
or `Footer`, but not those composite component Fibers themselves:

```text
React App subtree                         In-memory Taro result

App function Fiber                       no Taro node
└─ AppContext.Provider Fiber             no Taro node
   └─ View host Fiber             ─────► TaroElement('view')       App host
      ├─ Header component Fiber          no Taro node
      │  └─ Text host Fiber       ─────► TaroElement('text')       App host
      │     └─ HostText Fiber     ─────► TaroText                  App host
      └─ Page Taro root Fiber     ─────► TaroRootElement           boundary
         └─ Page host Fibers      ─────► Page Taro nodes           not App hosts
```

`wrap` is the compact native data generated from those App-side Taro nodes plus the private outlet marker. It contains no
Page-root descendants and is not another React component or React tree.

## Current issue

Taro already renders App and all mounted Pages in one React tree. On WX, each Page is also wrapped in a
`TaroRootElement` connected to that native Page's `setData()` method.

The current React Fiber tree and Taro host tree are related, but they are not the same structure.

The graph below shows both what remains exclusively in React and which host Fibers materialize Taro nodes:

```text
React Fiber tree and host materialization

ReactRoot                                  [HostRoot Fiber; uses the App host container]
└─ AppWrapper                              [class Fiber + instance; no Taro node]
   └─ App                                  [function Fiber; hooks/state/effects; no Taro node]
      └─ AppContext.Provider               [provider Fiber; propagates value; no Taro node]
         └─ View                           [HostComponent Fiber, className="app-wrap"]
            │                                └─ createInstance('view') ──► TaroElement('view')
            ├─ Text                        [HostComponent Fiber]
            │  │                             └─ createInstance('text') ──► TaroElement('text')
            │  └─ rendered string          [HostText Fiber] ─────────────► TaroText
            ├─ Button                      [HostComponent Fiber]
            │                                └─ createInstance('button') ► TaroElement('button')
            ├─ PageWrapper A               [class Fiber + instance; no Taro node]
            │  └─ root                     [HostComponent Fiber; not ReactRoot]
            │     │                          └─ createInstance('root') ──► TaroRootElement A
            │     └─ Taro PageContext.Provider
            │        │                     [provider Fiber; no Taro node]
            │        └─ Page A              [function/class Fiber; no direct Taro node]
            │           └─ render subtree
            │              ├─ component/Fragment Fibers                [no Taro nodes]
            │              └─ host Fibers ─────────────────────────────► Page A Taro nodes
            └─ PageWrapper B               [class Fiber + instance; no Taro node]
               └─ root                     [HostComponent Fiber; not ReactRoot]
                  │                          └─ createInstance('root') ──► TaroRootElement B
                  └─ Taro PageContext.Provider
                     │                     [provider Fiber; no Taro node]
                     └─ Page B              [function/class Fiber; no direct Taro node]
                        └─ render subtree
                           ├─ component/Fragment Fibers                 [no Taro nodes]
                           └─ host Fibers ──────────────────────────────► Page B Taro nodes
```

React-only Fibers continue to own component instances, hooks, state, effects, rendered children, and Context propagation.
The arrows show the host-config calls that create Taro nodes. `View`, `Text`, and `Button` are imported host strings, while
`app-wrap` is only the example CSS class. Connecting the materialized host nodes while skipping React-only Fibers produces
the separate Taro host tree:

```text
Taro host tree

App host container
└─ view                                  [TaroElement, class="app-wrap"]
   ├─ text
   ├─ button
   ├─ TaroRootElement A
   │  └─ Page A host nodes
   └─ TaroRootElement B
      └─ Page B host nodes
```

Those App-owned nodes already exist in current Taro. The renderer materializes every host Fiber regardless of whether a
native `setData()` sink exists. The fixture's App returns a `View` containing `Text`, `Button`, and `{children}`, so normal
host append operations place the corresponding `view`, `text`, `button`, and Page roots beneath the App host container.
If App returned only `{children}`, these App-owned host nodes would not exist.

The difference is ownership of native updates. The App container currently has no `TaroRootElement` ancestor, so `_root`
for the App-owned `view`, `text`, and `button` resolves to `null`; their mutations update only the in-memory Taro nodes.
Each nested Page root returns itself from `_root`, so its Page descendants still reach that Page's native sink.

WX does not render that complete Taro tree. Every native Page is an independent surface whose WXML currently reads only
that Page's `root` data:

```text
WX native view tree: Page A          WX native view tree: Page B

Page A host nodes                    Page B host nodes
```

The App-owned `view`, `text`, and `button` exist in the Taro host tree but are absent from both WX native view trees.

Each Page root works because it has a native sink:

```text
Page root A → native Page A.setData(root.*)
Page root B → native Page B.setData(root.*)
```

The App host nodes above those roots have no native Page sink. No Page WXML reads their data. Therefore:

- App hooks, state, effects, and Context execute normally;
- Page JSX is visible;
- App-owned host JSX is invisible on WX.

H5 does not have this limitation because the browser renders the ordinary React DOM tree directly.

## Current mechanism that must remain

### One React root

Taro's `AppWrapper` retains every Page currently mounted in the native navigation stack. A hidden Page remains in the
children collection until native `onUnload`, preserving its Fiber, state, effects, refs, and Context subscriptions.

A Taro `<root>` is only a host and update boundary. It is not another `ReactDOM.createRoot()`. Context therefore already
crosses from App providers into every Page.

### One Taro root per native Page

Yes, multiple Taro Page roots coexist whenever the WX navigation stack contains multiple mounted Page instances:

```text
Native stack [A]       → Taro roots [A]
Native stack [A, B]    → Taro roots [A, B]
Native stack [A, B, C] → Taro roots [A, B, C]
navigateBack()         → Taro roots [A, B]
```

Two instances of the same route also have two roots because each receives a unique `$taroPath`. These are host/update
roots inside one React Fiber tree, not additional React roots.

`connectReactPage()` implements `PageWrapper.render()` in this order:

```tsx
<root id={$taroPath}>
    <TaroPageContext.Provider value={$taroPath}>
        <Page />
    </TaroPageContext.Provider>
</root>
```

The outer `root` string creates a normal React host Fiber. The renderer then materializes that host Fiber as a
`TaroRootElement`; it does not call `ReactDOM.createRoot()`.

`document.createElement('root')` creates a `TaroRootElement` whose `_root` is itself and whose data path is `root`.
`createPageConfig()` assigns the native Page instance to `pageRoot.ctx`, so Page updates call only that Page's
`setData()`.

The new feature must add App rendering without replacing or coordinating these existing Page roots.

## Why the naive change is wrong

The App could be given a native scheduler and serialized recursively. However, its Taro host tree contains all mounted
Page roots. Normal `hydrate()` would therefore copy every Page subtree into the App data:

```text
wrap = App hosts + Page A hosts + Page B hosts + ...
```

That wrap would then be mirrored to every native Page even though every Page already stores its own `root` data.

For `P` mounted Pages, this approaches:

```text
O(P × (wrap + sum of all Page roots))
```

It also makes Page mount and unmount publish irrelevant wrap child-list updates.

Filtering Page data after hydration is not sufficient: it still traverses and allocates every Page subtree before throwing
the result away.

## Minimum solution

Make one private host node, `vpt_page_outlet`, the boundary between App-wrap serialization and the existing Page roots.

The proposed React Fiber tree adds one ordinary host Fiber at the existing `{children}` position:

```text
React Fiber tree

ReactRoot
└─ AppWrapper
   └─ App
      └─ AppContext.Provider
         └─ View                                  [host Fiber, className="app-wrap"]
            ├─ App-owned host Fibers
            └─ vpt_page_outlet                    [host Fiber]
               ├─ PageWrapper A
               │  └─ root                         [host Fiber; not ReactRoot]
               │     └─ Taro PageContext.Provider
               │        └─ Page A
               └─ PageWrapper B
                  └─ root                         [host Fiber; not ReactRoot]
                     └─ Taro PageContext.Provider
                        └─ Page B
```

The React renderer creates the corresponding Taro host node while omitting composite Fibers as usual:

```text
Taro host tree

App host container
└─ view                                  [TaroElement, class="app-wrap"]
   ├─ App-owned host nodes
   └─ vpt_page_outlet
      ├─ TaroRootElement A
      │  └─ Page A host nodes
      └─ TaroRootElement B
         └─ Page B host nodes
```

Each WX Page then renders the shared App wrap plus only its own local Page root:

```text
WX native view tree: Page A          WX native view tree: Page B

view [class="app-wrap"]               view [class="app-wrap"]
├─ App-owned native nodes            ├─ App-owned native nodes
└─ Page A native nodes               └─ Page B native nodes
   ↑ inserted at the outlet             ↑ inserted at the outlet
```

`vpt_page_outlet` is a WXML insertion template, not a native view, so it does not add a layout node to either WX tree.

Taro already owns the outlet's `childNodes` array and updates it through its normal `appendChild()`, `insertBefore()`, and
`removeChild()` methods called by the React renderer. The feature adds no parallel collection and never reconstructs this
information from native lifecycles. Preserving the array simply leaves Taro's existing host-tree bookkeeping unchanged.

Only native serialization stops at the outlet:

```text
Native Page A data                 Native Page B data

wrap                               wrap
└─ App hosts                       └─ App hosts
   └─ outlet                          └─ outlet

root                               root
└─ Page A hosts                    └─ Page B hosts
```

### Why not use each `PageWrapper` root as the marker

The existing Page roots could remain as compact markers while hydration omits only their descendants:

```text
serialized wrap

view
├─ header                 index 0
├─ Page root A marker     index 1
├─ Page root B marker     index 2
└─ footer                 index 3
```

Each native Page could store its own root `sid`, and a generated root-marker template could render `p.cn` only when the
marker `sid` matches. This is correct, but it makes every mounted Page root part of the wrap's serialized shape.

Those markers cannot be allowed to become stale because Taro's granular update paths use child-array indices. For example,
Page A initially receives:

```text
view.cn = [header, rootA, footer]
                              └─ footer index 2
```

After Page B is pushed, the in-memory Taro host tree becomes:

```text
view.cn = [header, rootA, rootB, footer]
                                     └─ footer index 3
```

If native Page A did not receive the `rootB` marker insertion, its footer would remain at index 2 while Taro would compute
future footer updates using index 3. A granular update could then target the wrong native data entry. Pop has the inverse
problem.

No explicit Page-stack tracker would be needed: `AppWrapper` and React already append/remove the Page roots, and Taro would
naturally publish those child-list changes. However, every push and pop would have to update every wrap mirror to keep
indices aligned. Every native Page would also store `P` compact markers, carry a Page identity, and inspect up to `P`
markers in WXML to render one local Page.

Putting a marker inside the Page root does not help: wrap hydration stops before that root, so the inner marker is absent
from the App wrap and cannot preserve the `{children}` position among the App's header, footer, or other hosts.

One outlet around `elements.slice()` represents the singular `{children}` expression directly:

```text
view
├─ header
├─ outlet
│  ├─ TaroRootElement A
│  └─ TaroRootElement B
└─ footer
```

The serialized wrap retains one stable insertion marker while Page-stack mutations remain hidden behind it. Each native
Page evaluates that marker once and inserts only its own `root`. This avoids Page IDs, WXML conditions, navigation-driven
wrap updates, and `O(P)` outlet scans.

This requires four focused changes.

### 1. Add the outlet as the normal WX child parent

Keep H5 unchanged. For WX, replace the direct Page children with one ordinary host wrapper:

```ts
const children = process.env.TARO_PLATFORM === 'web'
    ? h(Fragment, null, elements.slice())
    : h('vpt_page_outlet', null, elements.slice())

return h(App, props, children)
```

There is no React portal, detached container, second React root, Page registry, or active-Page tracker.

### 2. Make the outlet opaque to App-wrap data only

Specialize the pinned WX `@tarojs/runtime` in two places.

#### Hydration

When `hydrate()` reaches `vpt_page_outlet`, emit an empty child list without visiting Page roots:

```ts
const children = nodeName === 'vpt_page_outlet'
    ? []
    : node.childNodes.filter(isRenderableNode).map(hydrate)

data.cn = children
```

All ordinary App nodes still serialize recursively. Every Page root still serializes its own Page hosts through its own
scheduler.

#### Outlet-originated updates

Appending or removing a Page root continues to update Taro's existing JavaScript `childNodes`, but must not enqueue an
App-wrap `setData()` update:

```ts
TaroNode.prototype.enqueueUpdate = function (payload) {
    if (this.nodeName === 'vpt_page_outlet') return
    this._root?.enqueueUpdate(payload)
}
```

The specialization suppresses only native update forwarding from this private outlet. Parent relationships, ordering,
event-source cleanup, and ordinary Taro node removal remain unchanged.

Both changes must be applied as one asserted, source-mapped WX transform to the resolved Taro 4.2.0 ESM runtime. The
module identity must remain unchanged so Taro continues to have exactly one document and event source. H5 uses the stock
runtime.

### 3. Add one App-wrap scheduler

The App nodes currently resolve `_root` to `null`, so their normal Taro mutations have nowhere to enqueue native updates.
Reuse Taro's existing batching implementation by creating one new `TaroRootElement` solely as the wrap scheduler:

```ts
const wrapScheduler = document.createElement('root')

wrapScheduler.ctx = {
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
    _path: { get: () => 'wrap' },
    _root: { get: () => wrapScheduler }
})
```

This scheduler-only `TaroRootElement` is not appended to the Taro host tree, does not render a node, and is not a React
root. It contributes only Taro's existing update queue, path batching, callback batching, and scheduled flush behavior.

```text
Scheduler relationships (not host parentage)

App-side TaroElement._root ─────► wrapScheduler
                                  └─ ctx.setData(wrap delta)
                                     ├─ native Page A.setData(wrap delta)
                                     └─ native Page B.setData(wrap delta)

Page A TaroRootElement._root ───► itself ──► native Page A.setData(root delta)
Page B TaroRootElement._root ───► itself ──► native Page B.setData(root delta)
```

An App host mutation computes a path beginning with `wrap`, enters `wrapScheduler.enqueueUpdate()`, and is reconciled only
once. The scheduler's synthetic `ctx.setData()` sink then mirrors the resulting granular batch to the bounded native Page
stack. Only the visible Page's callback completes the logical React update; hidden mirrors need no extra reconciliation.

#### Seed a new Page in its existing initial batch

A new Page root already queues its initial `root.*` data before Taro connects it to the native Page. The React
`forceUpdate()` callback is the one point where the root exists but that initial queue has not flushed. Add one payload
there:

```ts
pageRoot.enqueueUpdate({
    path: 'wrap.cn',
    value: () => hydrate(appHostContainer).cn
})
```

Existing `createPageConfig()` then connects `pageRoot.ctx` and flushes the queue normally:

```text
existing initial batch = root.* + wrap.cn
                      └─ one native Page.setData()
```

The lazy value reads the committed App wrap at flush time. This adds no new queue, timer, lifecycle listener, or second
`setData()` call. The payload is one-shot: `performUpdate(true)` removes it from the queue during the first flush.

```text
New Page mount      → one full wrap snapshot + initial Page data
Page-local update   → root.* bridge delta only; no JS wrap hydration or wrap setData
App-wrap update     → wrap.* delta mirrored to mounted Pages
Page pop            → no wrap update
```

Therefore the JavaScript `O(wrap size)` hydration and native wrap-transfer cost is paid once for each newly mounted Page,
not on every Page render or Page state update.

This does not claim zero native WXML work on a Page update. WXML receives the `root.*` delta through `p`, and `p` is
forwarded through App-wrap template scopes until the outlet. WeChat may reevaluate those dependent scopes while locating
the changed Page nodes. `p` is deliberately omitted after the outlet, so this cost is bounded by the App wrap rather than
the Page subtree. The runtime performance tests must measure this separately from `setData()` payload size.

### 4. Join `wrap` and `root` in WXML

#### How current Page WXML works

A current WX Page owns one compact Taro data tree:

```ts
Page.data = {
    root: {
        cn: [/* compact records for the Page root's direct Taro children */]
    }
}
```

`pageHostNodes` in earlier shorthand meant these compact records; it is not a runtime variable or a collection of React
Fibers. Taro keeps real JavaScript host objects in `TaroRootElement.childNodes`, then `hydrate()` converts each one into a
plain serializable record for WeChat:

```text
In-memory Taro objects                         Native Page data

TaroRootElement.childNodes
└─ TaroElement('view')             hydrate()   Page.data.root.cn
   └─ TaroElement('text')          ─────────►  └─ compact view record
      └─ TaroText('Hello')                       └─ compact text record
                                                    └─ compact text-value record
```

A simplified compact result looks like:

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

The short keys are Taro's native-data format:

```text
cn   child records
nn   generated node/template alias
sid  stable Taro node identity used by events
cl   class name
v    text value
```

The numeric `nn` aliases depend on Taro's generated component table; WXML uses them to select the matching template.

The generated Page WXML imports Taro's shared templates and invokes their entry template:

```xml
<import src="../../base.wxml" />
<template is="taro_tmpl" data="{{root:root}}" />
```

The two uses of `root` have different roles:

```text
left root   = local variable expected by taro_tmpl
right root  = native Page.data.root
```

The shared entry template iterates the compact root children and dynamically chooses a generated host template:

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

A generated host template renders one native node and recursively renders its compact children:

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

The complete current path is:

```text
Page React hosts
└─ Page TaroRootElement serializes root.*
   └─ native Page.data.root
      └─ taro_tmpl(root)
         └─ generated tmpl_* recursion
            └─ WX Page native nodes
```

This renders Page hosts correctly. App-side Taro nodes are absent because the Page has no App data key and its WXML starts
directly from `Page.data.root`.

#### Why the minimum plan keeps two native data roots

A merged native tree is possible. Each Page could store one Page-specific composition:

```text
Page A data.root                     Page B data.root

App wrap                             App wrap
└─ outlet                            └─ outlet
   └─ Page A records                    └─ Page B records
```

Normal Page WXML could then start from one `root`, with no second top-level `wrap` value and no `p` threaded through App
templates. If this combined tree were the sole native representation, Page records would not need to be retained a second
time. The earlier claim that merging necessarily copies them was too strong.

Merging simplifies WXML but moves the composition problem into every runtime update path. A current Page mutation emits a
path relative to its `TaroRootElement`:

```text
root.cn.0.cn.1.v
```

In a merged native tree, the same value lives below the current App outlet path:

```text
root.cn.<App path>.cn.<outlet position>.cn.0.cn.1.v
```

The outlet can move when App reconciliation inserts, removes, or reorders App hosts. A merged implementation must
therefore:

- discover and retain the current outlet path;
- prefix or otherwise translate every Page-root payload;
- keep Taro's array-reset and native custom-component routing logic valid after translation;
- coordinate App structural updates and Page updates from the same React commit so neither writes to the other's old
  shape;
- construct the Page-specific combined tree before the first native flush.

That is a runtime projection and scheduling system. Native storage remains approximately `O(App wrap + local Page)` either
way; the merge changes shape rather than removing meaningful data.

The minimum plan instead retains Taro's existing Page root unchanged and adds one independent App-wrap tree:

```ts
Page.data = {
    wrap: {
        cn: [/* compact records hydrated from App-wrap Taro nodes */]
    },
    root: {
        cn: [/* compact records hydrated from this Page's Taro nodes */]
    }
}
```

Every existing `root.*` Page update remains valid without interception or path translation. WXML performs the one
composition operation declaratively.

This choice trades one extra WXML scope value for removing a general runtime path-remapping and cross-scheduler
coordination layer. If profiling later proves the WXML scope cost dominant, a merged-root renderer is a separate
architecture rather than a smaller form of this feature.

WXML must render this visual composition:

```text
wrap
└─ App native nodes
   ├─ Header
   ├─ insertion position ──► root.cn
   └─ Footer
```

The normal Taro entry template accepts only one variable named `root`, so the generated Page entry starts it with the App
wrap and retains the Page root under one additional short scope name, `p`:

```xml
<template is="taro_tmpl" data="{{root:wrap,p:root}}" />
```

The scope after that call is:

```text
taro_tmpl variable root  → native Page.data.wrap
taro_tmpl variable p     → native Page.data.root
```

`p` is only a WXML scope binding. It does not copy the Page tree and is not a React prop.

#### Why `p` must cross App-wrap template calls

The private outlet can occur at any host depth produced by App JSX:

```text
App View
└─ layout View
   └─ content View
      └─ outlet
```

A WXML `<template data="...">` call gives the child template an explicit scope. Values omitted from that data object are
not available in the child scope. Therefore every recursive call while traversing the App wrap must forward `p`:

```xml
<!-- current -->
data="{{i:item,c:c+1,l:xs.f(l,item.nn)}}"

<!-- proposed -->
data="{{i:item,c:c+1,l:xs.f(l,item.nn),p:p}}"
```

This is mechanical scope plumbing; element templates, props, events, classes, styles, and child iteration remain Taro's
existing generated code.

Taro resets template recursion through its virtual-host `comp` component at depth 15. The same value must cross that WXML
component scope:

```xml
<comp i="{{i}}" l="{{l}}" p="{{p}}" />
```

`comp.wxml` then resumes with `p`. Its `p` property accepts the Page-root object before the outlet and null after the
outlet. No layout node is added because `comp` is already Taro's existing virtual host.

#### How the outlet inserts the local Page

The compact wrap contains one private marker at the App's `{children}` position:

```text
wrap.cn
└─ App View
   ├─ Header node
   ├─ { nn: 'vpt_page_outlet', cn: [] }
   └─ Footer node
```

Taro's existing `xs.a()` dispatcher selects a template by compact node name. Add one template for that marker:

```xml
<template name="tmpl_0_vpt_page_outlet">
  <template
    is="{{xs.a(c, item.nn, l)}}"
    data="{{i:item,c:c+1,l:xs.f(l,item.nn)}}"
    wx:for="{{p.cn}}"
    wx:key="sid"
  />
</template>
```

The outlet emits no `<view>` or other native element. It loops over the current native Page's `p.cn` and feeds those nodes
straight into Taro's existing host templates. Native Page content consequently appears between Header and Footer without
changing the Page's compact data or React tree.

The outlet's child scope deliberately omits `p`. Page JSX cannot contain this App outlet, so the Page subtree does not need
the Page-root reference again. Shared recursive templates may continue forwarding an absent/null `p`, but they no longer
depend on the complete Page root object.

#### Why the outlet continues at depth `c`

Calling the entry template again appears simpler but is invalid while the same template namespace is active:

```xml
<!-- Do not do this inside taro_tmpl recursion. -->
<template is="taro_tmpl" data="{{root:p}}" />
```

WeChat detects the active template re-entering itself and stops the recursive call. Duplicating and renaming every Taro
host template would avoid that error but would nearly double static WXML.

The outlet instead performs the entry template's dispatch operation directly:

```xml
is="{{xs.a(c, item.nn, l)}}"
```

`c` is the next available recursion depth and `l` is Taro's existing special-component nesting state. Continuing both
values avoids an active template name, preserves Taro's depth accounting, and lets the existing depth-15 `comp` boundary
reset recursion when required. One normal template namespace is sufficient.

#### Minimum generated changes

The WXML change is limited to:

```text
1. Page data:       add wrap beside the existing root
2. Page entry:      root:root → root:wrap,p:root
3. App recursion:   forward one additional scope value p
4. comp boundary:   forward the same p through the existing depth reset
5. base template:   append one node-less outlet template
```

Everything else remains generated by Taro's existing template builder:

- Page `root.*` paths;
- host template bodies;
- native props and events;
- WXS dispatch helpers;
- recursive child rendering;
- depth limiting;
- native custom-component templates.

There is no second Page renderer, compiler-generated App clone, Page-specific template namespace, `page-base.wxml`, native
outlet node, or runtime Page-data composition.

#### What changes in Page rendering

The Page's React rendering logic does not change:

```text
Page component
└─ existing PageWrapper
   └─ existing TaroRootElement
      └─ existing Page host reconciliation
         └─ existing root.* updates to that native Page
```

`connectReactPage()`, the Page component, its Fiber subtree, and its Page-root scheduler retain their existing behavior.
The only React-tree change is that `AppWrapper` gives all existing Page wrappers one ordinary outlet host parent at the
App's `{children}` position.

The native Page composition does change:

```text
Current WX

Page root data ──► normal Taro WXML ──► Page native nodes

Proposed WX

App wrap data ──► normal Taro WXML
                         │
                         └─ outlet ──► the same Page root data ──► the same Page native nodes
```

Therefore the feature changes generated Page data initialization and the WXML entry scope, but it does not instantiate,
clone, remount, or reinterpret the Page's React render output.

## End-to-end flow

### First Page

1. Taro creates the singleton App React root.
2. `AppWrapper` renders the Page root as a normal child of `vpt_page_outlet`.
3. The outlet records that child but publishes no wrap child-list update.
4. The Page root queues its normal `root.*` updates.
5. The framework hydrates the App wrap; hydration stops at the outlet.
6. The framework queues `wrap.cn` on the Page root.
7. The Page's initial `setData()` contains both wrap and Page data.
8. WXML renders the wrap, reaches the outlet, and renders that Page's `root.cn` there.

### Navigation push

1. Existing Page Fibers remain mounted.
2. React appends the new Page root beneath the same outlet.
3. The outlet suppresses the irrelevant wrap child-list update.
4. The new native Page receives the current wrap snapshot plus its own root.
5. Existing native Pages require no synchronization work beyond future real wrap updates.

### App update

There is no explicit App-state subscription. The connection is established once when the framework assigns the App host
container `_path = 'wrap'` and `_root = wrapScheduler` before React renders the App.

If `setWrapCount()` changes the App's rendered `Text`, the existing React/Taro host pipeline performs:

```text
setWrapCount(1)
└─ React reconciles the singleton App
   └─ React updates the existing HostText Fiber
      └─ Taro renderer sets TaroText.nodeValue
         └─ TaroText.enqueueUpdate({ path: 'wrap....v', value: '1' })
            └─ parent _root lookup reaches wrapScheduler
               └─ wrapScheduler batches the wrap delta
                  └─ wrapScheduler.ctx.setData(delta)
                     ├─ native Page A.setData(delta)
                     └─ native Page B.setData(delta)
```

Only App state that changes App-wrap host output produces `wrap.*` data. A state update with identical host output produces
no native wrap update. Page-root data is never traversed or copied during this flow.

### Page update

1. React reconciles that Page Fiber.
2. Its nearest Taro root remains the existing Page `TaroRootElement`.
3. Taro emits granular `root.*` paths only to that native Page.
4. Wrap data and other Page roots are untouched.

### Navigation pop

1. React unmounts only the unloaded Page wrapper.
2. Taro removes its Page root from the outlet and performs normal cleanup.
3. The outlet publishes no irrelevant wrap child-list update.
4. Remaining Page Fibers retain their state.

## Correctness

### React Context

The outlet is an ordinary host Fiber. Page wrappers remain descendants of App providers in the same React root:

```text
App
└─ Provider
   └─ wrap hosts
      └─ outlet
         └─ Page wrapper
            └─ Taro Page root
               └─ Page
```

Serialization and `setData()` ownership cannot interrupt Context, error boundaries, Suspense, state, effects, or refs.

### Native ownership

The outlet does not become a Page scheduler. Each nested `TaroRootElement` still returns itself from `_root`, so Page host
mutations retain their existing `root.*` path and native sink.

### Native visual nesting

The outlet template emits no native wrapper. Page hosts are instantiated inside the current App-wrap WXML scope, so native
layout, style inheritance, and visual order match the App JSX around `{children}`.

### Hidden Pages

Every mounted native Page stores its own root and one mirror of the shared wrap. Real App updates keep hidden mirrors
current. Returning to a hidden Page requires no catch-up lifecycle patch.

## Performance

For App-wrap size `W`, Page sizes `R₁ ... Rₚ`, and `P` mounted native Pages:

```text
React App instances:       1
React Page instances:      P
Native wrap storage:       O(P × W)
Native Page storage:       O(sum Rᵢ)
App update bridge work:       O(P × delta W)
Page update bridge work:      O(delta Rᵢ)
New Page wrap seed:           O(W)
Page-root insertion bridge:   O(0)
Page-update wrap WXML scopes: O(W) worst-case reevaluation
```

Important properties:

- App reconciliation occurs once, regardless of Page count.
- Hydrating the wrap is `O(W)` because it stops before Page roots.
- Page mount/unmount does not publish wrap child-list data.
- Page updates retain Taro's existing granular bridge paths; WXML wrap-scope reevaluation is profiled separately.
- The generated WXML namespace is not duplicated.
- The plan adds no portal Fiber, detached Taro container, native outlet node, runtime collection, or lifecycle coordinator.
- The only unavoidable fan-out is one wrap delta per independent native Page surface.

## Implementation locations

### Framework runtime patch

Update:

```text
patches/@tarojs__plugin-framework-react@4.2.0-react19.patch
```

Add only:

- the private WX outlet host;
- the App container's `wrap` scheduler;
- wrap broadcasting;
- atomic initial wrap snapshot enqueueing.

Do not add a portal or detached Page container.

### WX Taro-runtime specialization

Add a focused transform under:

```text
packages/vite-plugin-taro/src/node/plugins/wx
```

It must match exactly one `hydrate()` child serialization site and exactly one `TaroNode.enqueueUpdate()` forwarding site
in pinned Taro 4.2.0, preserve source maps, and fail the build if either contract changes.

### Generated WXML and Page data

Update:

```text
packages/vite-plugin-taro/src/node/plugins/wx/output/templates.ts
packages/vite-plugin-taro/src/runtime/wx/capsule/page.ts
packages/vite-plugin-taro/src/runtime/wx/capsule/component.ts
```

Implement:

- `{ wrap, root }` Page data;
- `data="{{root:wrap,p:root}}"` Page entry;
- `p` forwarding through App-wrap scopes and recursive `comp`;
- direct `p.cn` dispatch at the outlet;
- no `p` propagation after the outlet;
- one WXML template namespace.

## Invariants

1. There is exactly one React root.
2. App and all mounted Pages remain in one ordinary Fiber ancestry.
3. WX gives retained Page roots exactly one private outlet parent.
4. Every outlet child is a Taro Page root.
5. Taro remains the sole owner of outlet child ordering through its existing `childNodes` implementation.
6. Wrap hydration never traverses outlet children.
7. Outlet-originated updates never enter the wrap scheduler.
8. Every Page root remains its own scheduler boundary.
9. Every native Page stores only the shared wrap mirror and its own Page root.
10. WXML renders the local Page root exactly once at the outlet.
11. H5 behavior and runtime remain unchanged.

## Validation

### Unit tests

- Runtime specialization changes only outlet hydration and outlet-originated forwarding.
- Hydrating a wrap stops before Page roots.
- Hydrating a Page root still includes all Page hosts.
- Appending, reordering, and removing Page roots uses Taro's existing `childNodes` and `parentNode` without calling the wrap sink.
- Page-descendant updates still call only their Page root sink.
- Generated assets contain one WXML namespace and no `page-base.wxml`.
- Template scope rewriting changes only standalone `data` attributes, never attributes such as `extra-data`.

### WX runtime

Use the App fixture above with at least two mounted Pages and verify:

- App JSX visibly wraps Page content;
- `[vpt-wrap] launch` is logged exactly once across Page pushes, hides, shows, and pops;
- `[vpt-wrap] effect mount` is logged once and `effectReady` changes from `false` to `true`;
- `[vpt-wrap] effect cleanup` is not logged during Page navigation;
- incrementing `app-wrap-increment` changes the singleton App state from `0` to `1`;
- the wrap and every visible or hidden Page Context probe observe the same `wrapCount` and `effectReady` values;
- navigating forward and back retains the App count, effect state, Context value, and Page-local state;
- App refs/effects and Page refs/effects are not remounted unexpectedly during ordinary navigation;
- initial rendering contains wrap and Page content in one native update;
- `page.data.wrap` contains no Page host subtree;
- Page mount and unmount produce no wrap child-list update;
- no recursive-template, property-type, or runtime warning occurs.

Use `setUpdatePerformanceListener({ withDataPaths: true })` to verify:

- an App update emits granular `wrap.*` paths once per mounted native Page;
- a Page update emits only granular `root.*` paths on that Page;
- neither update replaces a complete root unnecessarily.

### Regression matrix

Run:

- all plugin tests and workspace typechecks;
- WX and H5 production builds;
- Loan Genius navigation, forms, calculations, and complete HMR suite;
- deep/burst/rebuild/recovery HMR stress tests;
- native custom-component props, events, slots, and state updates;
- Towxml streaming/native integration;
- fresh generated-project WX and H5 builds;
- App source HMR while singleton App state is nonzero, verifying state and Context retention; React Refresh may rerun effects
  and must not retrigger the native App launch lifecycle.

## Acceptance criteria

The feature is complete only when all are true:

- App JSX visibly wraps every WX Page;
- no React portal or second React root exists;
- Context crosses from App to visible and hidden Pages;
- App launch runs once, App state remains singleton, and App effects do not remount during Page navigation;
- Taro DOM parentage remains ordinary App → outlet → Page roots;
- wrap data contains no serialized Page root;
- Page mount/unmount emits no wrap child-list bridge update;
- each native Page renders only its own `root` at the outlet;
- wrap and Page updates remain granular;
- one static WXML namespace is emitted;
- H5 is unchanged;
- the complete regression matrix passes.
