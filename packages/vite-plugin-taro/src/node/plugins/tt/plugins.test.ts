import assert from 'node:assert/strict'
import test from 'node:test'
import type { VptOptions } from '../../../options.ts'
import { createTtMiniContract, createTtMiniPlugins } from './plugins.ts'

const options: VptOptions = {
    target: 'tt',
    app: 'src/app.tsx',
    pages: [{ path: 'pages/home/index', config: { navigationBarTitleText: 'Home' } }, { path: 'pages/other/index' }],
    appJson: { pages: ['stale/index'], subpackages: [{ root: 'stale' }], window: { navigationBarTitleText: 'TT' } },
    projectConfigJson: { appid: 'tt-example', compileHotReload: true, setting: { urlCheck: true } },
    projectPrivateConfigJson: { setting: { urlCheck: false, autoCompile: true } },
    sitemapJson: { rules: [] }
}

test('binds TT runtime and style paths without translating native configuration', () => {
    const contract = createTtMiniContract(options)
    assert.equal(contract.options, options)
    assert.equal(contract.taro.env, 'tt')
    assert.match(contract.taro.componentsReactPath, /plugin-platform-tt[/\\]components-react\.js$/)
    assert.match(contract.taro.targetRuntimePath, /runtime[/\\]tt[/\\]taro-runtime\.(?:js|ts)$/)
    assert.match(contract.runtime.modules.devtoolsHmrRuntime, /tt[/\\]dev[/\\]devtools-runtime\.(?:js|ts)$/)
    assert.match(contract.runtime.modules.interpreterHmrRuntime, /tt[/\\]dev[/\\]interpreter-runtime\.(?:js|ts)$/)
    assert.deepEqual(contract.styles, { appFileName: 'app.ttss', globalFileName: 'assets/global.ttss' })
    assert.equal(contract.output.projectConfigFilename, 'project.config.json')
    assert.equal(contract.output.projectPrivateConfigFilename, 'project.private.config.json')
    assert.equal(createTtMiniPlugins(options).length, 8)
})

for (const isProduction of [false, true]) {
    test(`generates TT templates, native registrations and common packages (production=${isProduction})`, () => {
        const output = createTtMiniContract(options).output.generateProjectSkeleton({
            bundle: {},
            subpackages: [{ root: 'sub/p_example' }],
            nativeComponents: [
                { name: 'native-card', componentPath: '/sub/p_example/card/index', fields: ['@select'] }
            ],
            isProduction
        })
        const assets = new Map(output.map((asset) => [asset.fileName, String(asset.source)]))
        const asset = (name: string): string => {
            const source = assets.get(name)
            assert.notEqual(source, undefined, name)
            return source!
        }
        assert.deepEqual(
            [...assets.keys()],
            [
                'app.json',
                'base.ttml',
                'utils.sjs',
                'comp.ttml',
                'comp.json',
                'custom-wrapper.ttml',
                'custom-wrapper.json',
                'pages/home/index.json',
                'pages/home/index.ttml',
                'pages/home/index.ttss',
                'pages/other/index.json',
                'pages/other/index.ttml',
                'pages/other/index.ttss',
                'project.config.json',
                'project.private.config.json'
            ]
        )
        assert.deepEqual(JSON.parse(asset('app.json')), {
            pages: ['pages/home/index', 'pages/other/index'],
            window: { navigationBarTitleText: 'TT' },
            subPackages: [{ root: 'sub/p_example', pages: [], common: true }]
        })
        assert.equal(asset('app.json').includes('\n'), !isProduction)
        assert.deepEqual(JSON.parse(asset('project.config.json')), options.projectConfigJson)
        assert.deepEqual(JSON.parse(asset('project.private.config.json')), options.projectPrivateConfigJson)
        assert.equal(asset('project.private.config.json').includes('\n'), !isProduction)
        const base = asset('base.ttml')
        assert.match(base, /tt:for="{{i.cn}}"/)
        assert.match(base, /tt:key="sid"/)
        assert.match(base, /<template name="tmpl_0_vpt_fragment">/)
        assert.match(base, /<template name="tmpl_0_vpt_page_outlet">\s*<template is="taro_tmpl" data="{{root:p}}"/)
        assert.match(base, /<custom-wrapper i="{{i}}" p="{{p}}"/)
        assert.match(base, /<native-card\s+bindselect="eh"/)
        assert.doesNotMatch(base, /data="{{i:item}}"|wx:|a:for/)
        assert.match(asset('utils.sjs'), /module.exports/)
        assert.match(asset('comp.ttml'), /<import src=".\/base.ttml" \/>/)
        assert.match(asset('comp.ttml'), /<sjs module="xs" src=".\/utils.sjs" \/>/)
        assert.match(asset('comp.ttml'), /data="{{i:i,p:p}}"/)
        assert.match(asset('custom-wrapper.ttml'), /data="{{i:item,p:p}}"/)
        for (const page of options.pages) {
            assert.match(asset(`${page.path}.ttml`), /<comp i="{{app}}" p="{{page}}" \/>/)
            assert.match(asset(`${page.path}.ttml`), /\.\.\/\.\.\/base.ttml/)
            assert.equal(asset(`${page.path}.ttss`), '')
            const config = JSON.parse(asset(`${page.path}.json`))
            assert.equal(config.usingComponents['native-card'], '/sub/p_example/card/index')
            assert.equal(config.componentPlaceholder['native-card'], 'view')
        }
        assert.equal(JSON.parse(asset('pages/home/index.json')).navigationBarTitleText, 'Home')
        assert.deepEqual(JSON.parse(asset('comp.json')), JSON.parse(asset('custom-wrapper.json')))
        assert.equal(JSON.parse(asset('comp.json')).component, true)
    })
}

for (const [description, projectPrivateConfigJson, expected] of [
    ['omitted', undefined, []],
    ['empty', {}, ['{}']]
] as const) {
    test(`preserves ${description} TT private configuration without adding defaults`, () => {
        const output = createTtMiniContract({ ...options, projectPrivateConfigJson }).output.generateProjectSkeleton({
            bundle: {},
            subpackages: [],
            nativeComponents: [],
            isProduction: true
        })
        assert.deepEqual(
            output
                .filter((asset) => asset.fileName === 'project.private.config.json')
                .map((asset) => String(asset.source)),
            expected
        )
    })
}
