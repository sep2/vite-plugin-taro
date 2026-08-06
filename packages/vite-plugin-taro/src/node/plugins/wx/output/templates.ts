import { recursiveMerge } from '@tarojs/helper'
import { Weapp as WxPlatform } from '@tarojs/plugin-platform-weapp'
import type { Rolldown } from 'vite'
import type { JsonObject, VitePluginTaroOptions } from '../../../../options.ts'
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
    options: VitePluginTaroOptions,
    nativeComponents: readonly {
        name: string
        properties: readonly string[]
        events: readonly string[]
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

/** Creates the Taro WeChat template builder without invoking its Webpack integration. */
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
    return platform.template
}

/** Creates template metadata from the reachable Taro hosts and native schemas. */
function collectTemplateComponentConfig(
    bundle: Rolldown.OutputBundle,
    nativeComponents: readonly {
        name: string
        properties: readonly string[]
        events: readonly string[]
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
        config.thirdPartyComponents.set(
            component.name,
            new Set([...component.properties, ...component.events.map((name) => `bind:${name}`)])
        )
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
function createComponentJson(): JsonObject {
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
