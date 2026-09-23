import type { Rolldown } from 'vite'
import { getPageConfig } from '../../utils/project-config.ts'
import type { MiniContract, MiniJsonObject, MiniProjectSkeletonInput } from '../mini/mini-contract.ts'
import {
    buildRecursiveBaseTemplate,
    buildRecursiveComponentTemplate,
    buildRecursiveCustomWrapperTemplate
} from '../mini/skeleton/recursive-page-templates.ts'
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
import { createZfbTemplate } from './create-zfb-template.ts'

/**
 * Generates the Alipay templates that project one React ownership tree through two independent native Page data roots.
 *
 * ## Native data ownership
 *
 * Every native Page owns `app`, the latest singleton App projection, and `page`, that Page instance's compact React root. The App
 * document broadcasts granular `app.*` payloads to mounted Pages while each Page writes only `page.*`. The two projections meet
 * at `vpt_page_outlet`; the Page Fiber remains beneath App `children` in React memory for context, lifecycle, refs, effects,
 * removal, and HMR, but Page compact nodes never enter the App payload.
 *
 * ## AXML execution
 *
 * ```text
 * Page AXML (owns app, page, and optional page-meta)
 *   -> <comp i="{{app}}" p="{{page}}">       crosses both roots into one recursive component scope
 *      -> comp.axml imports base.axml         owns named-template lookup and event dispatch
 *         -> tmpl_0_vpt_fragment(i, p)        iterates the real compact App roots
 *            -> stock templates(i, p)         recursively render App descendants while forwarding p
 *               -> tmpl_0_vpt_page_outlet(p)
 *                  -> taro_tmpl(root: p)       renders this Page's compact children at the exact outlet
 * ```
 *
 * Alipay supports recursive named-template calls, so both trees stay inside one `comp` instance and need neither WX's depth-reset
 * components nor a second Page-renderer component. `vpt_fragment` adapts zero, one, or many App roots to `comp`'s one-node `i`
 * contract. It has no Fiber, sid, event source, ref, lifecycle, or native layout; only its real `cn` entries are keyed by sid.
 * The outlet is equally transparent and adds no native layout node.
 *
 * Every named `<template>` receives a fresh explicit `data` object. Consequently `p` must be copied through each App recursion
 * edge even though no stock host template reads it; otherwise the outlet can see `i` but not the Page root. The ordinary `p`
 * component attribute also avoids Alipay's slot-wrapper trap: a named template reached through an imported recursive table is
 * represented as another template component, which creates a fresh slot collection and loses the outer component's default slot.
 * Passing Page data directly preserves the required location without duplicating the Page tree or rendering it beside the App.
 *
 * ## Why the Page has no base import
 *
 * Taro 4.2.1 removes `base.axml` imports from Alipay Pages that register custom components. Every VPT Page registers `comp`, so its
 * AXML contains only optional PageMeta output and the `comp` bridge. The Page does not need an inlined copy either: `comp.axml` may
 * import the shared table legally, and that table renders both `i` and `p`. This keeps each Page small, gives every named template
 * one `utils.sjs` binding, and follows Taro's platform restriction without inventing a Page renderer.
 *
 * Both App and Page host events execute through `comp.eh` and resolve the original sid in Taro's shared event source. A `page.*`
 * update changes only the `p` property; an `app.*` update changes only `i`. Newly pushed Pages receive the current complete App
 * snapshot with their initial Page batch, while retained Pages require no navigation synchronization.
 *
 * Generated subpackages contain asynchronously loaded code rather than native routes. Alipay requires the `pages` field in each
 * declaration, but accepts an empty array and still packages the files beneath that root. Keeping `pages: []` preserves the real
 * model: no synthetic Page, native lifecycle, route, or template exists merely to make code eligible for asynchronous loading.
 */
export function createZfbSkeleton(
    { bundle, subpackages, nativeComponents, isProduction }: MiniProjectSkeletonInput,
    contract: MiniContract
): Rolldown.EmittedAsset[] {
    const { options, output, taro } = contract
    const template = createZfbTemplate()
    const componentConfig = collectTemplateComponentConfig(bundle, taro.componentsReactPath, nativeComponents)
    const nativeComponentConfig = createNativeComponentConfig(nativeComponents)
    const recursiveComponentJson = createRecursiveComponentJson(nativeComponentConfig)
    const baseTemplateSource = buildZfbBaseTemplate(template.buildTemplate(componentConfig))
    const recursiveComponentTemplateSource = buildRecursiveComponentTemplate(
        template.buildBaseComponentTemplate('.axml')
    )
    const customWrapperTemplateSource = buildRecursiveCustomWrapperTemplate(
        template.buildCustomComponentTemplate('.axml')
    )
    const generatedSubpackages = subpackages.map((subpackage) => createZfbSubpackageJson(subpackage.root))
    const jsonAsset = (fileName: string, value: MiniJsonObject) => createJsonAsset(fileName, value, isProduction)

    return [
        jsonAsset('app.json', createSkeletonAppJson(options, generatedSubpackages)),
        createTextAsset('base.axml', baseTemplateSource),
        createTextAsset('utils.sjs', template.buildXScript()),
        createTextAsset('comp.axml', recursiveComponentTemplateSource),
        jsonAsset('comp.json', recursiveComponentJson),
        createTextAsset('custom-wrapper.axml', customWrapperTemplateSource),
        jsonAsset('custom-wrapper.json', recursiveComponentJson),
        ...options.pages.flatMap((page) => {
            const baseTemplatePath = toRootRelativePath(page.path, 'base.axml')
            const pageTemplateSource = template.buildPageTemplate(baseTemplatePath, {
                content: getPageConfig(page),
                path: page.path
            })

            return [
                jsonAsset(`${page.path}.json`, createSkeletonPageJson(page, nativeComponentConfig)),
                createTextAsset(
                    `${page.path}.axml`,
                    buildZfbPageTemplate({
                        source: pageTemplateSource,
                        baseTemplatePath: baseTemplatePath
                    })
                ),
                createTextAsset(`${page.path}.acss`, '')
            ]
        }),
        jsonAsset(output.projectConfigFilename, options.projectConfigJson),
        ...(options.projectPrivateConfigJson
            ? [jsonAsset(output.projectPrivateConfigFilename, options.projectPrivateConfigJson)]
            : []),
        createTextAsset('.browserslistrc', 'defaults and fully supports es6-module')
    ]
}

/** Adds Alipay's transparent App collection and threads the independent Page root through every recursive data scope. */
export function buildZfbBaseTemplate(source: string): string {
    return buildRecursiveBaseTemplate(source, 'a')
}

/** Keeps Taro's optional PageMeta output while replacing its Page-owned template table with the two-root component bridge. */
function buildZfbPageTemplate({
    source,
    baseTemplatePath
}: Readonly<{
    source: string
    baseTemplatePath: string
}>): string {
    const withoutBaseImport = replaceExactlyOnce(
        source,
        `<import src="${baseTemplatePath}"/>`,
        '',
        'Alipay Page base import'
    )

    return replaceExactlyOnce(
        withoutBaseImport,
        '<template is="taro_tmpl" data="{{root:root}}" />',
        '<comp i="{{app}}" p="{{page}}" />',
        'Alipay Page template entry'
    )
}

/** Declares one Alipay code-only generated package without inventing a native route. */
function createZfbSubpackageJson(root: string): MiniJsonObject {
    return {
        root: root,
        pages: []
    }
}
