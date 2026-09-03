import { recursiveMerge } from '@tarojs/helper'
import { Weapp as WeappPlatform } from '@tarojs/plugin-platform-weapp'
import type { Rolldown } from 'vite'
import type { VptOptions } from '../../../options.ts'
import type { MiniJsonObject, MiniProjectSkeletonInput } from '../mini/mini-contract.ts'
import {
    collectTemplateComponentConfig,
    createJsonAsset,
    createNativeComponentConfig,
    createRecursiveComponentJson,
    createSkeletonAppJson,
    createSkeletonPageJson,
    createTextAsset,
    replaceExactlyOnce,
    toRootRelativePath
} from '../mini/skeleton/skeleton-utils.ts'

type WxSkeletonInput = MiniProjectSkeletonInput &
    Readonly<{
        options: VptOptions
        componentsModulePath: string
    }>

/**
 * Generates the WX templates that project one React ownership tree through two native Page data roots.
 *
 * ## Data ownership
 *
 * Each native Page starts with `app = { nn: 'vpt_fragment', cn: [] }` and `page = { cn: [] }`. The patched App document broadcasts
 * compact App mutations under `app.*`; the Page root writes only `page.*`. React still owns one tree from the App component,
 * through its `children`, to the independently scheduled Page root. Native templates join those projections only where React
 * placed `vpt_page_outlet`, so context, lifecycle, refs, events, effects, removal, and HMR ownership remain in memory rather than
 * being serialized from one root into the other.
 *
 * ## Template execution
 *
 * ```text
 * Page WXML (owns app, page, Page event handler, and Page light DOM)
 *   -> <comp i="{{app}}">                    crosses into the recursive component scope
 *      -> comp.wxml imports base.wxml         owns App event dispatch and named-template lookup
 *         -> tmpl_0_vpt_fragment              iterates the real compact roots in app.cn
 *            -> stock host templates          recursively render each App branch
 *               -> depth-reset <comp>         forwards light DOM only on the marked outlet spine
 *                  -> tmpl_0_vpt_page_outlet  consumes the forwarded default slot
 *                     -> taro_tmpl(page)       renders this Page's page.cn in caller scope
 * ```
 *
 * `vpt_fragment` adapts zero, one, or many App roots to `comp`'s one-node `i` contract. It is template-only: it has no Fiber, sid,
 * event source, ref, lifecycle, or native layout. Its `cn` entries remain real Taro compact nodes, and `wx:key="sid"` preserves
 * native component instances, sibling identity, and event routing during insertion and reorder. The outer `comp` exists once, so
 * exactly one Page slot is owned regardless of App root cardinality.
 *
 * ## Scope and slot forwarding
 *
 * WXML slots transfer caller-owned light DOM but not the caller's named-template table or WXS module scope. App dispatch occurs
 * after entering `comp.wxml`; therefore `vpt_fragment` and `vpt_page_outlet` must be defined in shared `base.wxml`, which every
 * recursive component imports. Defining them only in Page WXML can compile but fails when component-local dispatch cannot resolve
 * the names. `utils.wxs`, `comp.wxml`, and CustomWrapper otherwise remain Taro's stock products.
 *
 * Taro resets recursion depth through nested `comp` components. The renderer marks only the outlet-to-App-root compact ancestor
 * spine with `vo`; each generated depth-reset call checks that local marker before forwarding `<slot>`. This is O(1) per boundary,
 * requires no descendant search or App/Page mode property, and prevents unrelated App branches from instantiating Page content.
 * App events continue through `comp.eh`; slotted Page events retain the native Page's handler and original sid source.
 *
 * ## Updates and navigation
 *
 * A `page.*` update changes only caller-owned Page rendering because `app` is never passed into `taro_tmpl(page)`. App updates and
 * outlet-spine marker changes remain granular `app.*` payloads broadcast before mounted Pages render them. Adding or removing a
 * Page root mutates the in-memory outlet but does not serialize that root into App data. A newly pushed native Page receives the
 * current complete App snapshot with its initial Page batch; retained and hidden Pages need no navigation synchronization.
 */
export function createWxSkeleton({
    bundle,
    subpackages,
    nativeComponents,
    isProduction,
    options,
    componentsModulePath
}: WxSkeletonInput): Rolldown.EmittedAsset[] {
    const platform = new WeappPlatform(
        {
            helper: {
                recursiveMerge
            },
            // c8 cannot observe callbacks Taro accepts but intentionally never invokes.
            /* c8 ignore next */
            modifyWebpackChain() {},
            /* c8 ignore next */
            registerPlatform() {}
        },
        {},
        {}
    )
    platform.modifyTemplate({})

    const template = platform.template

    const nativeComponentConfig = createNativeComponentConfig(nativeComponents)
    const recursiveComponentJson = createRecursiveComponentJson(nativeComponentConfig)

    const jsonAsset = (fileName: string, value: MiniJsonObject) => createJsonAsset(fileName, value, isProduction)

    return [
        jsonAsset(
            'app.json',
            createSkeletonAppJson(
                options,
                subpackages.map((subpackage) => createWxSubpackageJson(subpackage.root))
            )
        ),
        createTextAsset(
            'base.wxml',
            buildWxBaseTemplate(
                template.buildTemplate(collectTemplateComponentConfig(bundle, componentsModulePath, nativeComponents))
            )
        ),

        createTextAsset('utils.wxs', template.buildXScript()),

        createTextAsset('comp.wxml', template.buildBaseComponentTemplate('.wxml')),
        jsonAsset('comp.json', recursiveComponentJson),
        createTextAsset('custom-wrapper.wxml', template.buildCustomComponentTemplate('.wxml')),
        jsonAsset('custom-wrapper.json', recursiveComponentJson),

        ...options.pages.flatMap((page) => [
            jsonAsset(`${page.path}.json`, createSkeletonPageJson(page, nativeComponentConfig)),
            createTextAsset(
                `${page.path}.wxml`,
                buildWxPageTemplate(
                    template.buildPageTemplate(toRootRelativePath(page.path, 'base.wxml'), {
                        content: page.config,
                        path: page.path
                    })
                )
            ),
            createTextAsset(`${page.path}.wxss`, '')
        ]),
        jsonAsset('project.config.json', options.projectConfigJson),
        ...(options.projectPrivateConfigJson
            ? [jsonAsset('project.private.config.json', options.projectPrivateConfigJson)]
            : []),
        ...(options.sitemapJson ? [jsonAsset('sitemap.json', options.sitemapJson)] : [])
    ]
}

/** Adds WX's transparent App collection, outlet, and conditional recursion-slot bridge. */
function buildWxBaseTemplate(source: string): string {
    const slotTransparentRecursion = replaceExactlyOnce(
        source,
        '<comp i="{{i}}" l="{{l}}" />',
        '<comp i="{{i}}" l="{{l}}"><slot wx:if="{{i.vo}}" /></comp>',
        'recursive comp call'
    )

    return `${slotTransparentRecursion}
<template name="tmpl_0_vpt_fragment">
  <template
    is="{{xs.a(0, item.nn, '')}}"
    data="{{i:item,c:1,l:xs.f('',item.nn)}}"
    wx:for="{{i.cn}}"
    wx:key="sid"
  />
</template>
<template name="tmpl_0_vpt_page_outlet"><slot /></template>
`
}

/** Replaces Taro's stock single Page root with independent App and Page data ownership. */
function buildWxPageTemplate(source: string): string {
    return replaceExactlyOnce(
        source,
        '<template is="taro_tmpl" data="{{root:root}}" />',
        '<comp i="{{app}}"><template is="taro_tmpl" data="{{root:page}}" /></comp>',
        'Page template entry'
    )
}

/** Declares one WX code-only generated package without inventing a native route. */
function createWxSubpackageJson(root: string): MiniJsonObject {
    return {
        name: root.slice(root.lastIndexOf('/') + 1),
        root: root,
        pages: []
    }
}
