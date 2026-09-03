import assert from 'node:assert/strict'
import test from 'node:test'
import { buildZfbBaseTemplate } from './create-zfb-skeleton.ts'
import { createZfbMiniContract } from './plugins.ts'

const contract = createZfbMiniContract({
    target: 'zfb',
    app: 'src/app.tsx',
    pages: [
        {
            path: 'pages/home/index',
            config: { navigationBarTitleText: 'Home' }
        },
        {
            path: 'pages/meta/index',
            config: { enablePageMeta: true }
        }
    ],
    appJson: {
        window: { navigationBarTitleText: 'Example' }
    },
    projectConfigJson: {
        format: 2,
        compileOptions: {
            globalObjectMode: 'enable',
            transpile: {}
        }
    }
})

test('rejects a Taro base template that lost its recursive child contract', () => {
    assert.throws(
        () => buildZfbBaseTemplate('<template name="taro_tmpl" />'),
        /Alipay base templates must recurse through compact child data/
    )
})

test('assembles contract-selected Alipay templates without WX dialect output', () => {
    const output = contract.output.generateProjectSkeleton({
        bundle: {},
        subpackages: [{ root: 'sub/p_example' }],
        nativeComponents: [
            {
                name: 'native-counter',
                componentPath: '/components/native-counter/index',
                fields: ['count', 'onIncrement']
            }
        ],
        isProduction: false
    })
    const assets = new Map(output.map((asset) => [asset.fileName, String(asset.source)]))

    assert.deepEqual(
        [...assets.keys()],
        [
            'app.json',
            'base.axml',
            'utils.sjs',
            'comp.axml',
            'comp.json',
            'custom-wrapper.axml',
            'custom-wrapper.json',
            'pages/home/index.json',
            'pages/home/index.axml',
            'pages/home/index.acss',
            'pages/meta/index.json',
            'pages/meta/index.axml',
            'pages/meta/index.acss',
            'mini.project.json',
            '.browserslistrc'
        ]
    )
    assert.deepEqual(JSON.parse(assets.get('app.json') ?? ''), {
        pages: ['pages/home/index', 'pages/meta/index'],
        window: { defaultTitle: 'Example' },
        subPackages: [
            {
                root: 'sub/p_example',
                pages: []
            }
        ]
    })
    assert.deepEqual(JSON.parse(assets.get('mini.project.json') ?? ''), {
        format: 2,
        compileOptions: {
            globalObjectMode: 'enable',
            transpile: {}
        }
    })
    assert.equal(assets.get('.browserslistrc'), 'defaults and fully supports es6-module')
    assert.equal(
        [...assets.keys()].some((fileName) => /\.(?:wxml|wxs|wxss)$/.test(fileName ?? '')),
        false
    )

    const baseTemplate = assets.get('base.axml') ?? ''
    assert.match(baseTemplate, /<import-sjs name="xs" from="\.\/utils\.sjs" \/>/)
    assert.match(baseTemplate, /<template name="tmpl_0_vpt_fragment">[\s\S]*data="{{i:item,p:p}}"[\s\S]*a:key="sid"/)
    assert.match(
        baseTemplate,
        /<template name="tmpl_0_vpt_page_outlet">\s*<template is="taro_tmpl" data="{{root:p}}" \/>\s*<\/template>/
    )
    assert.match(baseTemplate, /<custom-wrapper i="{{i}}" p="{{p}}"/)
    assert.doesNotMatch(baseTemplate, /<slot|wx:/)

    assert.match(assets.get('utils.sjs') ?? '', /^export default/)
    assert.match(assets.get('comp.axml') ?? '', /<import src="\.\/base\.axml" \/>/)
    assert.match(assets.get('comp.axml') ?? '', /data="{{i:i,p:p}}"/)
    assert.match(assets.get('custom-wrapper.axml') ?? '', /<import src="\.\/base\.axml" \/>/)
    assert.match(assets.get('custom-wrapper.axml') ?? '', /data="{{i:item,p:p}}"/)

    const recursiveComponentJson = JSON.parse(assets.get('comp.json') ?? '')
    assert.deepEqual(recursiveComponentJson, {
        component: true,
        styleIsolation: 'apply-shared',
        usingComponents: {
            'native-counter': '/components/native-counter/index',
            comp: './comp',
            'custom-wrapper': './custom-wrapper'
        }
    })
    assert.deepEqual(JSON.parse(assets.get('custom-wrapper.json') ?? ''), recursiveComponentJson)
    assert.deepEqual(JSON.parse(assets.get('pages/home/index.json') ?? ''), {
        defaultTitle: 'Home',
        usingComponents: {
            'native-counter': '/components/native-counter/index',
            comp: '../../comp',
            'custom-wrapper': '../../custom-wrapper'
        }
    })

    const homeTemplate = assets.get('pages/home/index.axml') ?? ''
    assert.doesNotMatch(homeTemplate, /<import|<import-sjs|<template/)
    assert.match(homeTemplate, /<comp i="{{app}}" p="{{page}}" \/>/)
    assert.doesNotMatch(homeTemplate, /root:root|wx:/)
    assert.equal(assets.get('pages/home/index.acss'), '')

    const metaTemplate = assets.get('pages/meta/index.axml') ?? ''
    assert.doesNotMatch(metaTemplate, /<import src=|<template/)
    assert.match(metaTemplate, /<page-meta/)
    assert.match(metaTemplate, /<comp i="{{app}}" p="{{page}}" \/>/)
    assert.equal(assets.get('pages/meta/index.acss'), '')
})
