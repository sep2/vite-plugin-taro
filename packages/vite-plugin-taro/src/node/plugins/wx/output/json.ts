import type { Rolldown } from 'vite'
import type { JsonObject, VitePluginTaroOptions, VitePluginTaroPageOption } from '../../../../options.ts'
import { createAppConfig } from '../../../utils/project-config.ts'
import type { GeneratedSubpackage } from '../placement/placer.ts'
import { isGeneratedSubpackageFile } from '../placement/plan.ts'
import { toRootRelativePath } from './relative-root.ts'

/** Creates every configured native JSON asset. */
export function createJsonAssets({
    options,
    subpackages,
    nativeComponents
}: {
    options: VitePluginTaroOptions
    subpackages: readonly GeneratedSubpackage[]
    nativeComponents: readonly { name: string; componentPath: string }[]
}): Rolldown.EmittedAsset[] {
    return [
        createJsonAsset('app.json', {
            ...createAppConfig(options),
            ...(subpackages.length > 0 ? { subPackages: subpackages } : {})
        }),

        ...options.pages.map((page) => createJsonAsset(`${page.path}.json`, createPageJson(page, nativeComponents))),

        createJsonAsset('project.config.json', options.projectConfigJson),

        ...(options.projectPrivateConfigJson
            ? [createJsonAsset('project.private.config.json', options.projectPrivateConfigJson)]
            : []),

        createJsonAsset('sitemap.json', options.sitemapJson)
    ]
}

/** Creates Page JSON with generated Taro and native component registrations. */
function createPageJson(
    page: VitePluginTaroPageOption,
    nativeComponents: readonly { name: string; componentPath: string }[]
): JsonObject {
    const usingComponents = isJsonObject(page.config.usingComponents) ? page.config.usingComponents : {}

    // Cross-package components require a placeholder while WeChat downloads their generated subpackage. Paths are
    // root-absolute, so remove the leading slash before testing the output-relative subpackage prefix.
    // https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages/async.html
    // https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/placeholder.html
    const placeholderEntries = nativeComponents.flatMap(({ name, componentPath }) =>
        isGeneratedSubpackageFile(componentPath.slice(1)) ? ([[name, 'view']] as const) : []
    )

    return {
        ...page.config,
        ...(placeholderEntries.length > 0 ? { componentPlaceholder: Object.fromEntries(placeholderEntries) } : {}),
        usingComponents: {
            ...usingComponents,
            ...Object.fromEntries(nativeComponents.map(({ name, componentPath }) => [name, componentPath])),
            comp: toRootRelativePath(page.path, 'comp')
        }
    }
}

/** Tests whether a configured JSON value can be merged as an object. */
function isJsonObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Serializes one native JSON object with stable formatting. */
export function renderJson(value: JsonObject): string {
    return `${JSON.stringify(value, null, 4)}\n`
}

/** Creates one native JSON asset. */
function createJsonAsset(fileName: string, value: JsonObject): Rolldown.EmittedAsset {
    return {
        type: 'asset',
        fileName,
        source: renderJson(value)
    }
}
