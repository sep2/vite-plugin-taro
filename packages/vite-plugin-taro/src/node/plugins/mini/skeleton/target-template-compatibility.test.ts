import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { RecursiveTemplate, UnRecursiveTemplate } from '@tarojs/shared/dist/template.js'

const packageRequire = createRequire(import.meta.url)
const runtimePackageRequire = createRequire(packageRequire.resolve('vite-plugin-taro-runtime/runtime/mini'))

type Platform = 'wx' | 'zfb' | 'tt'
type Implementation = 'local' | 'upstream'
type Scenario = 'all-components' | 'filtered-complex'
type Template = RecursiveTemplate | UnRecursiveTemplate
type ComponentConfig = {
    includes: Set<string>
    exclude: Set<string>
    thirdPartyComponents: Map<string, Set<string>>
    includeAll: boolean
}

function createComponentConfig(platform: Platform, scenario: Scenario): ComponentConfig {
    // Taro requires mutable collection types here; each collection is isolated to one generated template and never reused.
    const thirdPartyComponents = new Map([
        ['native-card', new Set(['@select-item', 'bindchange', 'onReady', 'catchtap', 'data-id'])],
        ['native-empty', new Set<string>()]
    ])

    if (scenario === 'all-components') {
        return {
            includes: new Set(),
            exclude: new Set(),
            thirdPartyComponents: thirdPartyComponents,
            includeAll: true
        }
    }

    const includes =
        platform === 'wx'
            ? new Set([
                  'view',
                  'canvas',
                  'share-element',
                  'keyboard-accessory',
                  'input',
                  'textarea',
                  'editor',
                  'root-portal',
                  'button'
              ])
            : new Set(['view', 'map', 'picker', 'swiper', 'swiper-item', 'slot', 'native-slot', 'page-meta', 'button'])

    return {
        includes: includes,
        exclude: new Set(['button']),
        thirdPartyComponents: thirdPartyComponents,
        includeAll: false
    }
}

async function createTemplate(platform: Platform, implementation: Implementation): Promise<Template> {
    if (implementation === 'local') {
        if (platform === 'wx') {
            const { createWxTemplate } = await import('../../wx/create-wx-template.ts')
            return createWxTemplate()
        }
        if (platform === 'zfb') {
            const { createZfbTemplate } = await import('../../zfb/create-zfb-template.ts')
            return createZfbTemplate()
        }
        const { createTtTemplate } = await import('../../tt/create-tt-template.ts')
        return createTtTemplate()
    }

    const platformPackage = {
        wx: '@tarojs/plugin-platform-weapp',
        zfb: '@tarojs/plugin-platform-alipay',
        tt: '@tarojs/plugin-platform-tt'
    }[platform]
    const platformPath = runtimePackageRequire.resolve(platformPackage)
    const platformModule = await import(pathToFileURL(platformPath).href)
    const upstreamHelper = createRequire(platformPath)('@tarojs/helper')
    const context = {
        helper: { recursiveMerge: upstreamHelper.recursiveMerge },
        paths: { outputPath: '' }
    }
    if (platform === 'wx') {
        const weapp = new platformModule.Weapp(context, {})
        weapp.modifyTemplate()
        return weapp.template
    }
    if (platform === 'zfb') {
        const alipay = new platformModule.Alipay(context, {})
        alipay.modifyComponents()
        return alipay.template
    }
    const tt = new platformModule.TT(context, {})
    tt.modifyTemplate()
    return tt.template
}

async function collectTemplateSurface(
    platform: Platform,
    implementation: Implementation,
    scenario: Scenario
): Promise<Record<string, unknown>> {
    const template = await createTemplate(platform, implementation)
    const extension = { wx: '.wxml', zfb: '.axml', tt: '.ttml' }[platform]
    const baseTemplatePath = `../../base${extension}`
    const generatedTemplate = template.buildTemplate(createComponentConfig(platform, scenario))

    return {
        template: generatedTemplate,
        xScript: template.buildXScript(),
        baseComponent: template.buildBaseComponentTemplate(extension),
        customComponent: template.buildCustomComponentTemplate(extension),
        xsDefault: template.buildXsTemplate(undefined),
        xsCustom: template.buildXsTemplate('../shared/utils'),
        pageUndefined: template.buildPageTemplate(baseTemplatePath, undefined),
        pageDisabled: template.buildPageTemplate(baseTemplatePath, {
            content: { enablePageMeta: false },
            path: 'pages/disabled/index'
        }),
        pageEnabled: template.buildPageTemplate(baseTemplatePath, {
            content: { enablePageMeta: true },
            path: 'pages/enabled/index'
        }),
        pageTruthy: template.buildPageTemplate(baseTemplatePath, {
            content: { enablePageMeta: 'enabled' },
            path: 'pages/truthy/index'
        }),
        state: {
            Adapter: template.Adapter,
            supportXS: template.supportXS,
            isXMLSupportRecursiveReference: template.isXMLSupportRecursiveReference,
            baseLevel: template.baseLevel,
            isUseXS: template.isUseXS,
            isUseCompileMode: template.isUseCompileMode,
            internalComponents: template.internalComponents,
            componentsAlias: template.componentsAlias,
            focusComponents: [...template.focusComponents],
            voidElements: [...template.voidElements],
            nestElements: [...template.nestElements]
        }
    }
}

function collectInIsolatedProcess(
    platform: Platform,
    implementation: Implementation,
    scenario: Scenario
): Record<string, unknown> {
    const output = execFileSync(
        process.execPath,
        [fileURLToPath(import.meta.url), 'collect', platform, implementation, scenario],
        {
            encoding: 'utf8',
            maxBuffer: 2 * 1024 * 1024
        }
    )
    return JSON.parse(output)
}

function assertMatchesUpstream(platform: Platform, scenario: Scenario): void {
    const local = collectInIsolatedProcess(platform, 'local', scenario)
    const upstream = collectInIsolatedProcess(platform, 'upstream', scenario)

    assert.deepEqual(local, upstream)
}

if (process.argv[2] === 'collect') {
    const platform = process.argv[3]
    const implementation = process.argv[4]
    const scenario = process.argv[5]
    if (
        (platform === 'wx' || platform === 'zfb' || platform === 'tt') &&
        (implementation === 'local' || implementation === 'upstream') &&
        (scenario === 'all-components' || scenario === 'filtered-complex')
    ) {
        process.stdout.write(JSON.stringify(await collectTemplateSurface(platform, implementation, scenario)))
    }
} else {
    for (const [platform, name] of [
        ['wx', 'WeChat'],
        ['zfb', 'Alipay'],
        ['tt', 'TikTok']
    ] as const) {
        for (const scenario of ['all-components', 'filtered-complex'] as const) {
            test(`matches upstream ${name} output for ${scenario}`, () => {
                assertMatchesUpstream(platform, scenario)
            })
        }
    }
}
