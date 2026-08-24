import type { Rolldown } from 'vite'
import type { VptJsonObject, VptOptions, VptPageOption } from '../../../../options.ts'
import { createAppConfig } from '../../../utils/project-config.ts'
import { type GeneratedSubpackage, isGeneratedSubpackageFile } from '../placer/placement.ts'
import { toRootRelativePath } from './relative-root.ts'

/** Creates every configured native JSON asset. */
export function createJsonAssets({
    options,
    subpackages,
    nativeComponents
}: {
    options: VptOptions
    subpackages: readonly GeneratedSubpackage[]
    nativeComponents: readonly { name: string; componentPath: string }[]
}): Rolldown.EmittedAsset[] {
    return [
        createJsonAsset(
            'app.json',
            createAppJson({ options: options, subpackages: subpackages, nativeComponents: nativeComponents })
        ),

        ...options.pages.map((page) => createJsonAsset(`${page.path}.json`, createPageJson(page))),

        createJsonAsset('project.config.json', options.projectConfigJson),

        ...(options.projectPrivateConfigJson
            ? [createJsonAsset('project.private.config.json', options.projectPrivateConfigJson)]
            : []),

        ...(options.sitemapJson ? [createJsonAsset('sitemap.json', options.sitemapJson)] : [])
    ]
}

/** Creates App JSON with globally inherited native registrations and generated subpackages. */
function createAppJson({
    options,
    subpackages,
    nativeComponents
}: {
    options: VptOptions
    subpackages: readonly GeneratedSubpackage[]
    nativeComponents: readonly { name: string; componentPath: string }[]
}): VptJsonObject {
    const appConfig = createAppConfig(options)

    const nativeUsingComponents = nativeComponents.map(({ name, componentPath }) => [name, componentPath])

    // Cross-package components require a placeholder while WeChat downloads their generated subpackage. Paths are
    // root-absolute, so remove the leading slash before testing the output-relative subpackage prefix.
    // https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages/async.html
    // https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/placeholder.html
    const componentPlaceholders = nativeComponents.flatMap(({ name, componentPath }) =>
        isGeneratedSubpackageFile(componentPath.slice(1)) ? ([[name, 'view']] as const) : []
    )

    return {
        ...appConfig,
        ...(nativeUsingComponents.length > 0
            ? {
                  usingComponents: {
                      ...(isJsonObject(appConfig.usingComponents) ? appConfig.usingComponents : {}),
                      ...Object.fromEntries(nativeUsingComponents)
                  }
              }
            : {}),
        ...(componentPlaceholders.length > 0
            ? {
                  componentPlaceholder: {
                      ...(isJsonObject(appConfig.componentPlaceholder) ? appConfig.componentPlaceholder : {}),
                      ...Object.fromEntries(componentPlaceholders)
                  }
              }
            : {}),
        ...(subpackages.length > 0 ? { subPackages: subpackages } : {})
    }
}

/** Preserves configured Page JSON and registers the standard generated recursive component entries. */
function createPageJson(page: VptPageOption): VptJsonObject {
    const usingComponents = isJsonObject(page.config.usingComponents) ? page.config.usingComponents : {}

    return {
        ...page.config,
        usingComponents: {
            ...usingComponents,
            comp: toRootRelativePath(page.path, 'comp'),
            'custom-wrapper': toRootRelativePath(page.path, 'custom-wrapper')
        }
    }
}

/** Tests whether a configured JSON value can be merged as an object. */
function isJsonObject(value: unknown): value is VptJsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Serializes one native JSON object with stable formatting. */
export function renderJson(value: VptJsonObject): string {
    return `${JSON.stringify(value, null, 4)}\n`
}

/** Creates one native JSON asset. */
function createJsonAsset(fileName: string, value: VptJsonObject): Rolldown.EmittedAsset {
    return {
        type: 'asset',
        fileName,
        source: renderJson(value)
    }
}
