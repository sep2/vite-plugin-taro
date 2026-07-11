import path from 'node:path'
import { recursiveMerge } from '@tarojs/helper'
import { Weapp as WxPlatform } from '@tarojs/plugin-platform-weapp'
import type { JsonObject } from '../../../options.ts'
import type { BuildContext } from '../../build-context.ts'
import { normalizeModuleId } from '../../module-paths.ts'
import { packageRequire } from '../../package-paths.ts'

export type WxAssetSource = string | Uint8Array

export type WxBundle = Record<
    string,
    {
        type: 'asset' | 'chunk'
        source?: WxAssetSource
        modules?: Record<string, { renderedExports?: string[] }>
    }
>

type WxAssetEmitter = {
    emitFile(asset: { type: 'asset'; fileName: string; source: WxAssetSource }): string
}

type WxTemplateComponentConfig = {
    includes: Set<string>
    exclude: Set<string>
    thirdPartyComponents: Map<string, Set<string>>
    includeAll: boolean
}

const taroWxComponentsPath = packageRequire.resolve('@tarojs/plugin-platform-weapp/dist/components-react')
const templateBuilder = createWxTemplateBuilder()

export function emitWxCompanionAssets(emitter: WxAssetEmitter, bundle: WxBundle, context: BuildContext): void {
    for (const asset of createWxCompanionAssets(bundle, context)) {
        emitter.emitFile({ type: 'asset', fileName: asset.fileName, source: asset.source })
    }
}

function createWxCompanionAssets(
    bundle: WxBundle,
    context: BuildContext
): { fileName: string; source: WxAssetSource }[] {
    const json = (value: JsonObject) =>
        context.development ? JSON.stringify(value, null, 2) : JSON.stringify(value)

    return [
        { fileName: 'app.json', source: json(context.project.appConfig) },
        { fileName: 'app.wxss', source: collectWxBundleStyles(bundle) },
        {
            fileName: 'base.wxml',
            source: templateBuilder.buildTemplate(collectWxTemplateComponentConfig(bundle))
        },
        { fileName: 'utils.wxs', source: templateBuilder.buildXScript() },
        { fileName: 'comp.wxml', source: templateBuilder.buildBaseComponentTemplate('.wxml') },
        { fileName: 'comp.json', source: json(createWxComponentConfig()) },
        { fileName: 'project.config.json', source: json(createWxProjectConfig(context)) },
        { fileName: 'project.private.config.json', source: json(context.project.projectPrivateConfigJson) },
        { fileName: 'sitemap.json', source: json(context.project.sitemapJson) },
        ...context.project.pages.flatMap((page) => [
            {
                fileName: `${page.path}.wxml`,
                source: templateBuilder.buildPageTemplate(relativeWxRootAsset(page.path, 'base.wxml'), {
                    content: page.config,
                    path: page.path
                })
            },
            {
                fileName: `${page.path}.json`,
                source: json({
                    ...page.config,
                    usingComponents: { comp: relativeWxRootAsset(page.path, 'comp') }
                })
            },
            { fileName: `${page.path}.wxss`, source: '' }
        ])
    ]
}

function createWxProjectConfig(context: BuildContext): JsonObject {
    const projectConfig = context.project.projectConfigJson
    const setting = isJsonObject(projectConfig.setting) ? projectConfig.setting : {}
    return {
        ...projectConfig,
        setting: { ...setting, compileHotReLoad: true }
    }
}

function isJsonObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function createWxTemplateBuilder() {
    const platform = new WxPlatform(
        { helper: { recursiveMerge }, modifyWebpackChain() {}, registerPlatform() {} },
        {},
        {}
    )
    platform.modifyTemplate({})
    return platform.template
}

function relativeWxRootAsset(pagePath: string, rootAsset: string): string {
    const relativePath = path.posix.relative(path.posix.dirname(pagePath), rootAsset)
    return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}

function collectWxTemplateComponentConfig(bundle: WxBundle): WxTemplateComponentConfig {
    const config: WxTemplateComponentConfig = {
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
    const components = findBundleModule(bundle, taroWxComponentsPath)
    for (const name of components?.renderedExports ?? []) config.includes.add(toDashed(name))
    return config
}

function findBundleModule(bundle: WxBundle, resolvedId: string): { renderedExports?: string[] } | undefined {
    const normalizedResolvedId = normalizeModuleId(resolvedId)
    for (const item of Object.values(bundle)) {
        if (item.type !== 'chunk') continue
        const found = Object.entries(item.modules ?? {}).find(([id]) => normalizeModuleId(id) === normalizedResolvedId)
        if (found) return found[1]
    }
}

function toDashed(value: string): string {
    return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

function createWxComponentConfig(): JsonObject {
    return {
        component: true,
        styleIsolation: 'apply-shared',
        usingComponents: { comp: './comp' }
    }
}

function collectWxBundleStyles(bundle: WxBundle): string {
    const styles: string[] = []
    for (const [fileName, item] of Object.entries(bundle)) {
        if (item.type !== 'asset' || !fileName.endsWith('.css')) continue
        const source = typeof item.source === 'string' ? item.source : new TextDecoder().decode(item.source)
        if (source) styles.push(source)
        delete bundle[fileName]
    }
    return styles.join('\n')
}
