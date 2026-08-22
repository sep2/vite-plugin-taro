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
            templateBuilder.buildTemplate(collectTemplateComponentConfig(bundle, nativeComponents))
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
 * Adapts Taro's stock template builder to the native half of the App-wrap data flow without changing its recursive renderer.
 *
 * The React/framework patch keeps one tree shaped as App -> vpt_page_outlet -> Page roots. The runtime patch mirrors App
 * hosts under Page.data.app, keeps each Page root under Page.data.page, and makes the outlet opaque during App hydration.
 * These closures provide the matching WXML behavior:
 *
 * 1. buildTemplate keeps Taro's host templates, teaches depth-reset comp calls to forward one default slot, and adds the two
 *    transparent private templates. vpt_fragment adapts the App root collection to comp's one-node input; vpt_page_outlet
 *    consumes the Page-owned slot at React's {children} position.
 * 2. buildPageTemplate makes the native Page the sole owner of both bindings: generic comp receives app, while its slot keeps
 *    the normal taro_tmpl bound directly to page. The complete Page object never enters App recursion.
 * 3. buildXScript remains upstream because Taro's alias and path helpers already operate on either compact subtree.
 * 4. buildBaseComponentTemplate remains upstream so comp still knows only generic compact recursion and event dispatch; all
 *    behavior belongs to the generated call site and Page boundary rather than App-specific component properties.
 *
 * createTemplateAssets can therefore remain ordinary asset orchestration, one template namespace is retained, and neither
 * Page updates nor native-component declarations become dependencies of App recursion.
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
        buildTemplate: (componentConfig: TemplateComponentConfig) => {
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
