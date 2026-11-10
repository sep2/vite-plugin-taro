import type { RecursiveTemplate } from '@tarojs/shared/dist/template.js'
import type { Rolldown } from 'vite'
import { getPageConfig } from '../../../utils/project-config.ts'
import type { MiniContract, MiniJsonObject, MiniProjectSkeletonInput } from '../mini-contract.ts'
import {
    buildRecursiveBaseTemplate,
    buildRecursiveComponentTemplate,
    buildRecursiveCustomWrapperTemplate
} from './recursive-page-templates.ts'
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
} from './skeleton-utils.ts'

/** Emits recursive named templates with independent App and Page roots and target-owned package declarations. */
export function createRecursiveSkeleton(
    { bundle, nativeComponents, isProduction }: MiniProjectSkeletonInput,
    contract: MiniContract,
    platform: Readonly<{
        template: RecursiveTemplate
        extension: '.ttml' | '.xhsml'
        directive: 'tt' | 'xhs'
        subpackages: readonly MiniJsonObject[]
    }>
): Rolldown.EmittedAsset[] {
    const { options, output, taro } = contract
    const { template, extension, directive, subpackages } = platform
    const baseFileName = `base${extension}`
    const nativeComponentConfig = createNativeComponentConfig(nativeComponents)
    const recursiveComponentJson = createRecursiveComponentJson(nativeComponentConfig)
    const jsonAsset = (fileName: string, value: MiniJsonObject) => createJsonAsset(fileName, value, isProduction)

    return [
        jsonAsset('app.json', createSkeletonAppJson(options, subpackages)),
        createTextAsset(
            baseFileName,
            buildRecursiveBaseTemplate(
                template.buildTemplate(
                    collectTemplateComponentConfig(bundle, taro.componentsReactPath, nativeComponents)
                ),
                directive
            )
        ),
        createTextAsset('utils.sjs', template.buildXScript()),
        createTextAsset(
            `comp${extension}`,
            buildRecursiveComponentTemplate(template.buildBaseComponentTemplate(extension))
        ),
        jsonAsset('comp.json', recursiveComponentJson),
        createTextAsset(
            `custom-wrapper${extension}`,
            buildRecursiveCustomWrapperTemplate(template.buildCustomComponentTemplate(extension))
        ),
        jsonAsset('custom-wrapper.json', recursiveComponentJson),
        ...options.pages.flatMap((page) => [
            jsonAsset(`${page.path}.json`, createSkeletonPageJson(page, nativeComponentConfig)),
            createTextAsset(
                `${page.path}${extension}`,
                replaceExactlyOnce(
                    template.buildPageTemplate(toRootRelativePath(page.path, baseFileName), {
                        content: getPageConfig(page),
                        path: page.path
                    }),
                    '<template is="taro_tmpl" data="{{root:root}}" />',
                    '<comp i="{{app}}" p="{{page}}" />',
                    `${directive.toUpperCase()} Page template entry`
                )
            )
        ]),
        jsonAsset(output.projectConfigFilename, options.projectConfigJson),
        ...(options.projectPrivateConfigJson
            ? [jsonAsset(output.projectPrivateConfigFilename, options.projectPrivateConfigJson)]
            : [])
    ]
}
