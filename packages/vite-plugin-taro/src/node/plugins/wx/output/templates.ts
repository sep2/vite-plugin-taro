import { recursiveMerge } from '@tarojs/helper'
import { Weapp as WxPlatform } from '@tarojs/plugin-platform-weapp'
import type { Rolldown } from 'vite'
import type { VptJsonObject, VptOptions } from '../../../../options.ts'
import { normalizeModuleId } from '../../../utils/modules.ts'
import { packageRequire } from '../../../utils/packages.ts'
import { renderJson } from './json.ts'
import { toRootRelativePath } from './relative-root.ts'

type TemplateComponentConfig = {
    includes: Set<string>
    exclude: Set<string>
    thirdPartyComponents: Map<string, Set<string>>
    includeAll: boolean
}

const taroComponentsModulePath = packageRequire.resolve('@tarojs/plugin-platform-weapp/dist/components-react')

/** Creates Taro's shared WeChat templates and native WXML/WXSS companions for every Page. */
export function createTemplateAssets(
    bundle: Rolldown.OutputBundle,
    options: VptOptions,
    nativeComponents: readonly {
        name: string
        fields: readonly string[]
    }[]
): Rolldown.EmittedAsset[] {
    const templateBuilder = createTemplateBuilder()

    return [
        createAsset(
            'base.wxml',
            templateBuilder.buildBaseTemplate(collectTemplateComponentConfig(bundle, nativeComponents))
        ),
        createAsset('utils.wxs', templateBuilder.buildXScript()),
        createAsset('comp.wxml', templateBuilder.buildBaseComponentTemplate('.wxml')),
        createAsset('comp.json', renderJson(createComponentJson())),
        ...options.pages.flatMap((page) => [
            createAsset(
                `${page.path}.wxml`,
                templateBuilder.buildPageTemplate(toRootRelativePath(page.path, 'base.wxml'), {
                    content: page.config,
                    path: page.path
                })
            ),
            createAsset(`${page.path}.wxss`, '')
        ])
    ]
}

/**
 * Adapts Taro's stock template builder to the WXML half of WX App wrapping without changing its recursive renderer.
 *
 * End-to-end contract
 * -------------------
 * React and Taro retain one in-memory ownership tree:
 *
 * App React root
 *   -> App host records
 *      -> vpt_page_outlet host at App {children}
 *         -> independently scheduled Taro Page roots
 *
 * The patched WX document makes the singleton App host a TaroRootElement. App host mutations therefore batch under app.*
 * and fan out to every mounted native Page. Each Page root remains its own TaroRootElement and emits only page.*. Patched
 * hydrate() serializes App hosts but stops at vpt_page_outlet, so Page roots remain attached for React Context, lifecycle,
 * events, removal, refs, effects, and HMR without being copied into app data.
 *
 * Build-time output
 * -----------------
 * createTemplateAssets still asks one builder for the normal five products: shared base.wxml, utils.wxs, comp.wxml,
 * comp.json, and each Page WXML. This adapter specializes only the two products that own the native join:
 *
 * - shared base.wxml receives branchless slot forwarding plus vpt_fragment and vpt_page_outlet template definitions;
 * - each Page WXML replaces Taro's root:root entry with one generic comp bound to app and one caller-owned taro_tmpl bound
 *   to page as that component's default slot.
 *
 * utils.wxs remains Taro's normal compact-node dispatcher. comp.wxml and comp.json remain Taro's generic depth-reset
 * component and still know only i, l, virtual-host behavior, and eh event dispatch. There is one shared template namespace,
 * no Page-specific base file, no App/Page mode property, and no Page object threaded through App template data.
 *
 * First native Page
 * -----------------
 * createPageConfig starts the native Page with:
 *
 *     app  = { nn: 'vpt_fragment', cn: [] }
 *     page = { cn: [] }
 *
 * nn lets unchanged comp dispatch one input object even though App JSX may produce zero, one, or many root hosts. The record
 * is WXML-only rather than a Taro host, so it needs no sid. After React commits the Page root below the outlet, the framework
 * queues a lazy hydrate(AppRoot).cn value beside the Page root's already-pending page.* payloads. Taro drains both through the
 * native Page's existing first setData, making App wrapping and Page content appear atomically.
 *
 * Native WXML execution
 * ---------------------
 * Data/slot ownership and named-template ownership intentionally travel through different scopes:
 *
 * Page WXML (owns app, page, Page eh, and Page-content light DOM)
 *   -> <comp i="{{app}}"> (crosses into a virtual custom-component scope)
 *      -> comp.wxml (owns App eh, imports utils.wxs and shared base.wxml)
 *         -> tmpl_0_vpt_fragment (iterates the real App compact roots in app.cn)
 *            -> stock Taro templates (render App hosts and recurse through their cn arrays)
 *               -> depth-reset <comp i="{{i}}" l="{{l}}"><slot /></comp>
 *                  -> forwarded default slot, repeated for every required depth reset
 *               -> tmpl_0_vpt_page_outlet at React's exact {children} position
 *                  -> <slot />
 *                     -> caller-owned <template is="taro_tmpl" data="{{root:page}}" />
 *                        -> stock Taro templates render this native Page's page.cn records
 *
 * The virtual comp and both private templates add no native layout node. App events execute through comp.eh; slotted Page
 * events retain the native Page's eh. Both resolve the original Taro sid through the same event source.
 *
 * Named-template scope
 * --------------------
 * Slots transfer caller-owned light DOM only. They do not transfer the caller's named-template table or WXS modules. App
 * dispatch runs inside comp.wxml, so vpt_fragment and vpt_page_outlet must live in base.wxml imported by that component.
 * Putting those definitions in buildPageTemplate produces Page WXML that compiles, but component runtime dispatch fails with
 * `Template tmpl_0_vpt_fragment not found`. Shared base.wxml makes the names visible in the root and every depth-reset comp
 * scope and emits them once rather than once per Page.
 *
 * Steady-state updates and navigation
 * -----------------------------------
 * A page.* setData updates only the caller-owned Page template inside the slot. app is not passed through that template and
 * comp.i does not change, so Page updates cannot invalidate App recursion. An app.* batch updates comp.i independently on
 * every retained native Page; the Page slot data remains unchanged. Adding or removing a React Page root mutates the outlet
 * only in memory; the runtime suppresses that marker's native child update. A newly pushed Page receives the latest complete
 * App snapshot in its initial batch, while existing and hidden Pages require no navigation synchronization.
 *
 * Method responsibilities
 * -----------------------
 * 1. buildBaseTemplate wraps Taro's buildTemplate output, preserves every stock host template, forwards the slot at Taro's
 *    existing depth-reset call site, and adds the two private definitions to the dispatcher-visible shared namespace.
 * 2. buildPageTemplate owns only the Page boundary: app binding, page binding, and the single Page-content slot.
 * 3. buildXScript delegates unchanged because Taro's aliases, lineage, and depth selection operate on both compact roots.
 * 4. buildBaseComponentTemplate delegates unchanged so recursive comp remains generic and feature-independent.
 *
 * H5 never calls this WX output builder. Its App continues to receive ordinary Fragment children and none of these native
 * data roots, templates, custom-component boundaries, or slot rules enter the browser build.
 */
function createTemplateBuilder() {
    const platform = new WxPlatform(
        {
            helper: {
                recursiveMerge
            },
            modifyWebpackChain() {},
            registerPlatform() {}
        },
        {},
        {}
    )
    platform.modifyTemplate({})
    const taroTemplateBuilder = platform.template

    /**
     * Replaces one pinned Taro fragment so an upstream template change cannot silently break the coordinated
     * framework/runtime/WXML boundary or partially apply the feature.
     */
    function replaceExactlyOnce(source: string, current: string, replacement: string, description: string): string {
        const firstIndex = source.indexOf(current)
        const duplicateIndex = firstIndex === -1 ? -1 : source.indexOf(current, firstIndex + current.length)
        if (firstIndex === -1 || duplicateIndex !== -1) {
            throw new Error(`Expected one ${description}, found ${firstIndex === -1 ? 0 : 'multiple'}`)
        }
        return `${source.slice(0, firstIndex)}${replacement}${source.slice(firstIndex + current.length)}`
    }

    return {
        buildBaseTemplate: (componentConfig: TemplateComponentConfig) => {
            const source = taroTemplateBuilder.buildTemplate(componentConfig)
            /*
             * Taro inserts recursive comp only when template depth resets. App {children} may be below any number of those
             * boundaries, so each generic boundary forwards its caller's default slot unchanged. No App/Page mode or Page
             * data is threaded through template scopes: Page recursion simply forwards an unused empty slot, while App
             * recursion carries the one Page-owned slot until vpt_page_outlet consumes it.
             */
            const slotTransparentRecursion = replaceExactlyOnce(
                source,
                '<comp i="{{i}}" l="{{l}}" />',
                `<comp i="{{i}}" l="{{l}}"><slot /></comp>`,
                'recursive comp call'
            )

            /*
             * These definitions belong in shared base.wxml rather than buildPageTemplate. Although native data is Page-owned,
             * the dynamic calls that render App records execute after crossing into comp.wxml's component scope. WXML slots
             * transfer caller-owned light DOM, not the caller's named-template table or WXS modules. comp.wxml can therefore
             * resolve only its own definitions and those imported from base.wxml.
             *
             * Defining the two names in Page WXML is not merely redundant: WeChat accepts that Page file at compile time, then
             * comp.wxml's runtime dispatch fails with `Template tmpl_0_vpt_fragment not found` because component template
             * resolution never searches the caller Page. Shared base.wxml is already imported by comp.wxml, makes both names
             * visible at every depth-reset component scope, and emits them once instead of once per generated Page.
             *
             * Page WXML can give generic comp one i object, whereas App output is a root collection. vpt_fragment bridges
             * those contracts without becoming a native or Taro host: its nn is only a template discriminator and its
             * template emits each real cn record directly. Keeping the collection behind one comp is important because that
             * component owns exactly one Page slot regardless of whether App rendered zero, one, or many top-level hosts.
             * The synthetic record is not keyed or event-addressable, so it deliberately has no sid.
             *
             * vpt_page_outlet is the matching terminal. The patched runtime retains Page roots below that marker in memory
             * for React/Taro ownership but serializes no children into app data; this slot inserts the parent Page's separate
             * page data at the same visual position and adds no native layout wrapper.
             */
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
        },
        buildXScript: () => {
            // Alias selection and compact paths are unchanged; both app and page records use Taro's normal node vocabulary.
            return taroTemplateBuilder.buildXScript()
        },
        buildBaseComponentTemplate: (ext: string) => {
            /*
             * Keep comp generic. i is the current compact node dispatched through i.nn. l is Taro's lineage of selected
             * special/native aliases: xs.f records bounded/nestable ancestors and xs.a uses that history when choosing a
             * generated template level on non-recursive WXML platforms. The current comp.wxml restarts its local lineage from
             * i.nn, but l remains part of Taro's intentional depth-reset component contract and platform variants may consume
             * it. Preserve that upstream binding; only the new Page-root comp starts with the property's empty default.
             * Slot forwarding lives at this base.wxml call site, so comp still needs no App/Page mode or data.
             */
            return taroTemplateBuilder.buildBaseComponentTemplate(ext)
        },
        buildPageTemplate: (baseTempPath: string, page: Record<string, unknown>) => {
            const source = taroTemplateBuilder.buildPageTemplate(baseTempPath, page)

            /*
             * The native Page owns both data bindings. app is the transparent single-node adapter rendered by unchanged
             * comp; the caller-owned taro_tmpl still reads only page and becomes comp's one default slot. A page.* update
             * therefore cannot enter App template scopes or a component property, while App recursion can place the Page
             * exactly at {children} by consuming the slot at vpt_page_outlet. The root call omits l because this native comp
             * starts a fresh lineage scope and its generic property already defaults to the empty string. It also emits no id:
             * no runtime lookup, event dispatch, ref, or selector addresses this virtual boundary.
             */
            return replaceExactlyOnce(
                source,
                '<template is="taro_tmpl" data="{{root:root}}" />',
                `<comp i="{{app}}"><template is="taro_tmpl" data="{{root:page}}" /></comp>`,
                'Page template entry'
            )
        }
    }
}

/** Creates template metadata from reachable Taro hosts and native component JSX fields. */
function collectTemplateComponentConfig(
    bundle: Rolldown.OutputBundle,
    nativeComponents: readonly {
        name: string
        fields: readonly string[]
    }[]
): TemplateComponentConfig {
    // This local config accumulates names in output order before the template builder consumes it.
    const config: TemplateComponentConfig = {
        includes: new Set([
            'view',
            'catch-view',
            'static-view',
            'pure-view',
            'click-view',
            'scroll-view',
            'image',
            'static-image',
            'text',
            'static-text'
        ]),
        exclude: new Set(),
        thirdPartyComponents: new Map(),
        includeAll: false
    }
    const components = findBundleModule(bundle, taroComponentsModulePath)
    for (const name of components?.renderedExports ?? []) {
        config.includes.add(toDashed(name))
    }
    for (const component of nativeComponents) {
        config.thirdPartyComponents.set(component.name, new Set(component.fields))
    }
    return config
}

/** Finds one module in the final chunk metadata. */
function findBundleModule(bundle: Rolldown.OutputBundle, resolvedId: string): Rolldown.RenderedModule | undefined {
    const normalizedResolvedId = normalizeModuleId(resolvedId)
    for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') {
            continue
        }
        const found = Object.entries(output.modules).find(([id]) => normalizeModuleId(id) === normalizedResolvedId)
        if (found) {
            return found[1]
        }
    }
}

/** Converts a React component export to Taro's dashed host-component name. */
function toDashed(value: string): string {
    return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

/** Creates the recursive component configuration expected by Taro's templates. */
function createComponentJson(): VptJsonObject {
    return {
        component: true,
        styleIsolation: 'apply-shared',
        usingComponents: {
            comp: './comp'
        }
    }
}

/** Creates one emitted template or style asset. */
function createAsset(fileName: string, source: string): Rolldown.EmittedAsset {
    return {
        type: 'asset',
        fileName,
        source
    }
}
