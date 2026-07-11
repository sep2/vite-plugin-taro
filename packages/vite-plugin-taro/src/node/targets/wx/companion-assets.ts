import path from 'node:path'
import { recursiveMerge } from '@tarojs/helper'
import { Weapp as WechatPlatform } from '@tarojs/plugin-platform-weapp'
import type { JsonObject } from '../../../options.ts'
import type { VitePluginTaroBuildContext } from '../../context.ts'
import { normalizeModuleId } from '../../module-paths.ts'
import { nodeRequire } from '../../runtime-paths.ts'

export type WechatAssetSource = string | Uint8Array

export type WechatBundle = Record<
    string,
    {
        type: 'asset' | 'chunk'
        source?: WechatAssetSource
        modules?: Record<string, { renderedExports?: string[] }>
    }
>

type WechatAssetEmitter = {
    emitFile(asset: { type: 'asset'; fileName: string; source: WechatAssetSource }): string
}

type WechatTemplateComponentConfig = {
    includes: Set<string>
    exclude: Set<string>
    thirdPartyComponents: Map<string, Set<string>>
    includeAll: boolean
}

const taroWechatComponentsReactPath = nodeRequire.resolve('@tarojs/plugin-platform-weapp/dist/components-react')
let cachedTemplateBuilder: ReturnType<typeof createWechatTemplateBuilder> | undefined

export function emitWechatAssets(
    emitter: WechatAssetEmitter,
    bundle: WechatBundle,
    context: VitePluginTaroBuildContext,
    production: boolean
): void {
    for (const asset of createWechatAssets(bundle, context, production)) {
        emitter.emitFile({ type: 'asset', fileName: asset.fileName, source: asset.source })
    }
}

function createWechatAssets(
    bundle: WechatBundle,
    context: VitePluginTaroBuildContext,
    production: boolean
): { fileName: string; source: WechatAssetSource }[] {
    cachedTemplateBuilder ??= createWechatTemplateBuilder()
    const templateBuilder = cachedTemplateBuilder
    const json = (value: JsonObject) => (production ? JSON.stringify(value) : JSON.stringify(value, null, 2))
    return [
        { fileName: 'app.json', source: json(context.appConfig) },
        { fileName: 'app.wxss', source: collectWechatBundleWxss(bundle) },
        {
            fileName: 'base.wxml',
            source: templateBuilder.buildTemplate(collectWechatTemplateComponentConfig(bundle))
        },
        { fileName: 'utils.wxs', source: templateBuilder.buildXScript() },
        { fileName: 'comp.wxml', source: templateBuilder.buildBaseComponentTemplate('.wxml') },
        { fileName: 'comp.json', source: json(createWechatCompJson()) },
        { fileName: 'project.config.json', source: json(createWechatProjectConfig(context)) },
        { fileName: 'project.private.config.json', source: json(context.projectPrivateConfigJson) },
        { fileName: 'sitemap.json', source: json(context.sitemapJson) },
        ...context.pages.flatMap((page) => [
            {
                fileName: `${page.path}.wxml`,
                source: templateBuilder.buildPageTemplate(relativeRootAsset(page.path, 'base.wxml'), {
                    content: page.config,
                    path: page.path
                })
            },
            {
                fileName: `${page.path}.json`,
                source: json({
                    ...page.config,
                    usingComponents: { comp: relativeRootAsset(page.path, 'comp') }
                })
            },
            { fileName: `${page.path}.wxss`, source: '' }
        ])
    ]
}

function createWechatProjectConfig(context: VitePluginTaroBuildContext): JsonObject {
    const setting = isJsonObject(context.projectConfigJson.setting) ? context.projectConfigJson.setting : {}
    return {
        ...context.projectConfigJson,
        setting: { ...setting, compileHotReLoad: true }
    }
}

function isJsonObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function createWechatTemplateBuilder() {
    const platform = new WechatPlatform(
        { helper: { recursiveMerge }, modifyWebpackChain() {}, registerPlatform() {} },
        {},
        {}
    )
    platform.modifyTemplate({})
    return platform.template
}

function relativeRootAsset(pagePath: string, rootAsset: string): string {
    const relativePath = path.posix.relative(path.posix.dirname(pagePath), rootAsset)
    return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}

function collectWechatTemplateComponentConfig(bundle: WechatBundle): WechatTemplateComponentConfig {
    const config: WechatTemplateComponentConfig = {
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
    const components = findBundleModule(bundle, taroWechatComponentsReactPath)
    for (const name of components?.renderedExports ?? []) config.includes.add(toDashed(name))
    return config
}

function findBundleModule(bundle: WechatBundle, resolvedId: string): { renderedExports?: string[] } | undefined {
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

function createWechatCompJson(): JsonObject {
    return {
        component: true,
        styleIsolation: 'apply-shared',
        usingComponents: { comp: './comp' }
    }
}

function collectWechatBundleWxss(bundle: WechatBundle): string {
    const styles: string[] = []
    for (const [fileName, item] of Object.entries(bundle)) {
        if (item.type !== 'asset' || !fileName.endsWith('.css')) continue
        const source = typeof item.source === 'string' ? item.source : new TextDecoder().decode(item.source)
        if (source) styles.push(source)
        delete bundle[fileName]
    }
    return styles.join('\n')
}
