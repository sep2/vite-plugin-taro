import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveConfig } from 'vite'
import type { VptOptions } from '../../../options.ts'
import { miniPageCapsuleId } from '../mini/module/module.ts'
import { createXhsSkeleton } from './create-xhs-skeleton.ts'
import { createXhsTemplate } from './create-xhs-template.ts'
import { createXhsMiniContract, createXhsMiniPlugins } from './plugins.ts'

const options: VptOptions = {
    target: 'xhs',
    app: 'src/app.tsx',
    pages: [{ path: 'pages/home/index', config: { navigationBarTitleText: 'Home' } }],
    appJson: { pages: ['stale'], subpackages: [{ root: 'stale' }], window: { navigationBarTitleText: 'XHS' } },
    projectConfigJson: { appid: 'xhs-example', setting: { compileHotReload: true, minified: false } },
    projectPrivateConfigJson: { setting: { urlCheck: false, compileHotReload: true } }
}

test('binds XHS native APIs, template rendering, CSS, and both HMR transports', () => {
    const contract = createXhsMiniContract({ ...options, renderer: 'dom' })
    assert.equal(contract.automaticSubpackages, false)
    assert.equal(contract.taro.env, 'xhs')
    assert.match(contract.taro.hostPath, /mini[/\\]template[/\\]template-host\.(?:ts|js)$/)
    assert.match(contract.taro.componentsReactPath, /plugin-platform-xhs[/\\]components-react\.js$/)
    assert.match(contract.taro.targetRuntimePath, /xhs[/\\]taro-runtime\.(?:ts|js)$/)
    assert.match(contract.runtime.devtoolsHmrRuntime, /xhs[/\\]dev[/\\]devtools-runtime\.(?:ts|js)$/)
    assert.match(contract.runtime.interpreterHmrRuntime, /xhs[/\\]dev[/\\]interpreter-runtime\.(?:ts|js)$/)
    assert.deepEqual(contract.styles, { appFileName: 'app.css', globalFileName: 'assets/global.css' })
    assert.deepEqual(contract.define, {})
    assert.equal(contract.output.projectConfigFilename, 'project.config.json')
    assert.equal(contract.output.projectPrivateConfigFilename, 'project.private.config.json')
    assert.equal(contract.output.generateProjectSkeleton, createXhsSkeleton)
})

test('initializes XHS Pages with native data objects while preserving input options', async () => {
    const input: VptOptions = {
        ...options,
        pages: [undefined, false, true].map((prerender, index) => ({
            path: `pages/route-${index}/index`,
            ...(prerender === undefined ? {} : { prerender })
        }))
    }
    const original = structuredClone(input)
    const plugins = createXhsMiniPlugins(input)
    const plugin = plugins.find(
        (value) => value && typeof value === 'object' && 'name' in value && value.name === 'vpt:mini'
    )
    assert.ok(plugin && typeof plugin === 'object' && 'transform' in plugin)
    assert.ok('options' in plugin && typeof plugin.options === 'function')
    await Reflect.apply(plugin.options, { environment: { config: { root: process.cwd() } } }, [{}])
    const transform = plugin.transform
    assert.ok(transform && typeof transform === 'object' && 'handler' in transform)
    for (const page of input.pages) {
        const result: unknown = Reflect.apply(
            transform.handler,
            { environment: { config: { build: { sourcemap: false } } } },
            ['const options = __VPT_PAGE_OPTIONS__', `${miniPageCapsuleId}?route=${encodeURIComponent(page.path)}`]
        )
        assert.ok(result && typeof result === 'object' && 'code' in result && typeof result.code === 'string')
        assert.deepEqual(Function(`${result.code}; return options`)(), {
            path: page.path,
            prerender: false
        })
    }
    assert.deepEqual(input, original)
})

for (const isProduction of [false, true]) {
    test(`emits XHS recursive scopes and native component registrations (production=${isProduction})`, () => {
        const contract = createXhsMiniContract(options)
        const output = createXhsSkeleton(
            {
                bundle: {},
                pages: contract.options.pages,
                subpackages: [{ root: 'sub/p_example' }],
                nativeComponents: [
                    { name: 'native-card', componentPath: '/sub/p_example/card/index', fields: ['@select'] }
                ],
                isProduction
            },
            contract
        )
        const assets = new Map(output.map((asset) => [asset.fileName, String(asset.source)]))
        const asset = (name: string): string => {
            const value = assets.get(name)
            assert.ok(value, name)
            return value
        }
        assert.deepEqual(
            [...assets.keys()],
            [
                'package.json',
                'app.json',
                'base.xhsml',
                'utils.sjs',
                'comp.xhsml',
                'comp.json',
                'custom-wrapper.xhsml',
                'custom-wrapper.json',
                'pages/home/index.json',
                'pages/home/index.xhsml',
                'project.config.json',
                'project.private.config.json'
            ]
        )
        assert.deepEqual(JSON.parse(asset('app.json')), {
            pages: ['pages/home/index'],
            window: { navigationBarTitleText: 'XHS' },
            subPackages: [{ root: 'sub/p_example', pages: [] }]
        })
        assert.deepEqual(JSON.parse(asset('package.json')), { type: 'commonjs' })
        assert.equal(asset('package.json').includes('\n'), !isProduction)
        assert.equal(asset('app.json').includes('\n'), !isProduction)
        assert.deepEqual(JSON.parse(asset('project.config.json')), options.projectConfigJson)
        assert.deepEqual(JSON.parse(asset('project.private.config.json')), options.projectPrivateConfigJson)
        assert.equal(asset('project.private.config.json').includes('\n'), !isProduction)
        const base = asset('base.xhsml')
        assert.match(base, /xhs:for="{{i.cn}}"/)
        assert.match(base, /xhs:key="sid"/)
        assert.match(base, /<native-card\s+bindselect="eh"/)
        assert.match(base, /data="{{i:item,p:p}}"/)
        assert.match(base, /<custom-wrapper i="{{i}}" p="{{p}}"/)
        assert.match(base, /<template name="tmpl_0_vpt_page_outlet">\s*<template is="taro_tmpl" data="{{root:p}}"/)
        assert.doesNotMatch(base, /wx:|tt:|a:for|data="{{i:item}}"/)
        assert.match(asset('comp.xhsml'), /<sjs module="xs" src=".\/utils.sjs" \/>/)
        assert.match(asset('comp.xhsml'), /data="{{i:i,p:p}}"/)
        assert.match(asset('custom-wrapper.xhsml'), /data="{{i:item,p:p}}"/)
        assert.match(asset('pages/home/index.xhsml'), /<comp i="{{app}}" p="{{page}}" \/>/)
        assert.match(asset('pages/home/index.xhsml'), /\.\.\/\.\.\/base.xhsml/)
        assert.match(asset('utils.sjs'), /module.exports/)
        assert.deepEqual(JSON.parse(asset('comp.json')), JSON.parse(asset('custom-wrapper.json')))
        assert.equal(JSON.parse(asset('comp.json')).styleIsolation, 'apply-shared')
        const page = JSON.parse(asset('pages/home/index.json'))
        assert.equal(page.navigationBarTitleText, 'Home')
        assert.equal(page.usingComponents['native-card'], '/sub/p_example/card/index')
        assert.equal(page.componentPlaceholder['native-card'], 'view')
    })
}

for (const [description, projectPrivateConfigJson, expected] of [
    ['omitted', undefined, []],
    ['empty', {}, ['{}']]
] as const) {
    test(`preserves ${description} XHS private configuration`, () => {
        const contract = createXhsMiniContract({ ...options, projectPrivateConfigJson })
        const output = createXhsSkeleton(
            { bundle: {}, pages: contract.options.pages, subpackages: [], nativeComponents: [], isProduction: true },
            contract
        )
        assert.deepEqual(
            output
                .filter(({ fileName }) => fileName === 'project.private.config.json')
                .map(({ source }) => String(source)),
            expected
        )
    })
}

test('keeps XHS component metadata isolated and applies its event and sharing spellings', () => {
    const template = createXhsTemplate()
    const output = template.buildTemplate({
        includes: new Set(),
        exclude: new Set(),
        thirdPartyComponents: new Map(),
        includeAll: true
    })
    assert.match(output, /bindgetphonenumber="eh"/)
    assert.match(output, /data-share-type=/)
    assert.match(output, /<post-note-button\s/)
    assert.match(output, /<group-chat-card\s/)
    assert.match(output, /<video-player\s/)
    assert.equal(template.buildXsTemplate(undefined), '<sjs module="xs" src="./utils.sjs" />')
    assert.equal(template.buildXsTemplate('../shared/utils'), '<sjs module="xs" src="../shared/utils.sjs" />')
    assert.notStrictEqual(template.internalComponents, createXhsTemplate().internalComponents)
})

for (const command of ['build', 'serve'] as const) {
    for (const watch of [undefined, {}]) {
        test(`selects XHS native hot-reload overrides (command=${command}, watch=${Boolean(watch)})`, async () => {
            const config = await resolveConfig({ configFile: false, build: { watch }, logLevel: 'silent' }, command)
            const overrides = createXhsMiniContract(options).override
            assert.deepEqual(
                overrides.map(({ name }) => name),
                ['project.config.json', 'project.private.config.json']
            )
            for (const override of overrides) {
                assert.equal(override.apply(config), command === 'build' && Boolean(watch))
                assert.deepEqual(override.content, { setting: { compileHotReload: false } })
            }
        })
    }
}
