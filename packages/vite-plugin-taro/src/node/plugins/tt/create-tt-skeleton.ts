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
import { createTtTemplate } from './create-tt-template.ts'

/**
 * TT supports recursive named templates. Like Alipay, its App host carries the independent Page root as p through each
 * template scope and CustomWrapper boundary. The TT runtime declares p as a native property on both generated components.
 * This preserves the App → Page React tree without copying Page nodes into the shared App projection or adding layout nodes.
 */
export function createTtSkeleton(
    { bundle, subpackages, nativeComponents, isProduction }: MiniProjectSkeletonInput,
    contract: MiniContract
): Rolldown.EmittedAsset[] {
    const { options, output, taro } = contract
    const template = createTtTemplate()
    const nativeComponentConfig = createNativeComponentConfig(nativeComponents)
    const recursiveComponentJson = createRecursiveComponentJson(nativeComponentConfig)
    const jsonAsset = (fileName: string, value: MiniJsonObject) => createJsonAsset(fileName, value, isProduction)

    return [
        jsonAsset(
            'app.json',
            createSkeletonAppJson(
                options,
                // TT requires common packages for require.async across package boundaries (base library 2.86.1+).
                subpackages.map(({ root }) => ({ root, pages: [], common: true }))
            )
        ),
        createTextAsset(
            'base.ttml',
            buildRecursiveBaseTemplate(
                template.buildTemplate(
                    collectTemplateComponentConfig(bundle, taro.componentsReactPath, nativeComponents)
                ),
                'tt'
            )
        ),
        createTextAsset('utils.sjs', template.buildXScript()),
        createTextAsset('comp.ttml', buildRecursiveComponentTemplate(template.buildBaseComponentTemplate('.ttml'))),
        jsonAsset('comp.json', recursiveComponentJson),
        createTextAsset(
            'custom-wrapper.ttml',
            buildRecursiveCustomWrapperTemplate(template.buildCustomComponentTemplate('.ttml'))
        ),
        jsonAsset('custom-wrapper.json', recursiveComponentJson),
        ...options.pages.flatMap((page) => [
            jsonAsset(`${page.path}.json`, createSkeletonPageJson(page, nativeComponentConfig)),
            createTextAsset(
                `${page.path}.ttml`,
                replaceExactlyOnce(
                    template.buildPageTemplate(toRootRelativePath(page.path, 'base.ttml'), {
                        content: getPageConfig(page),
                        path: page.path
                    }),
                    '<template is="taro_tmpl" data="{{root:root}}" />',
                    '<comp i="{{app}}" p="{{page}}" />',
                    'TT Page template entry'
                )
            ),
            createTextAsset(`${page.path}.ttss`, '')
        ]),
        // project.tt.json is Taro's source config filename; TikTok DevTools consumes project.config.json in the output.
        jsonAsset(output.projectConfigFilename, options.projectConfigJson),
        ...(options.projectPrivateConfigJson
            ? [jsonAsset(output.projectPrivateConfigFilename, options.projectPrivateConfigJson)]
            : [])
    ]
}
