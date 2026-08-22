import assert from 'node:assert/strict'
import test from 'node:test'
import type { Rolldown } from 'vite'
import type { VptOptions } from '../../../../options.ts'
import { createTemplateAssets } from './templates.ts'

const options: VptOptions = {
    target: 'wx',
    app: 'src/app.tsx',
    pages: [
        {
            path: 'pages/home/index',
            config: {}
        },
        {
            path: 'pages/account/index',
            config: {}
        }
    ],
    appJson: {},
    projectConfigJson: {},
    sitemapJson: {}
}

test('creates shared Taro templates and native companions for every Page', () => {
    const templateAssets = createTemplateAssets({} as Rolldown.OutputBundle, options, [
        {
            name: 'native-counter',
            fields: ['count', 'extraData', 'label', 'onIncrement']
        }
    ])
    const assets = new Map(templateAssets.map((asset) => [asset.fileName, String(asset.source)]))

    assert.deepEqual(
        [...assets.keys()],
        [
            'base.wxml',
            'utils.wxs',
            'comp.wxml',
            'comp.json',
            'pages/home/index.wxml',
            'pages/home/index.wxss',
            'pages/account/index.wxml',
            'pages/account/index.wxss'
        ]
    )
    const baseTemplate = assets.get('base.wxml') ?? ''
    const componentTemplate = assets.get('comp.wxml') ?? ''
    const homeTemplate = assets.get('pages/home/index.wxml') ?? ''

    assert.match(baseTemplate, /<template name="tmpl_0_native-counter">/)
    assert.match(
        baseTemplate,
        /<native-counter\s+count="{{i\.count}}" extraData="{{i\.extraData}}" label="{{i\.label}}" bindincrement="eh"/
    )
    assert.match(
        baseTemplate,
        /<template name="tmpl_0_vpt_fragment">\s*<template\s+is="{{xs\.a\(0, item\.nn, ''\)}}"[\s\S]*wx:for="{{i\.cn}}"[\s\S]*wx:key="sid"/
    )
    assert.match(baseTemplate, /<template name="tmpl_0_vpt_page_outlet">\s*<slot \/>\s*<\/template>/)
    assert.match(baseTemplate, /<comp i="{{i}}" l="{{l}}">\s*<slot \/>\s*<\/comp>/)
    assert.doesNotMatch(baseTemplate, /s:s|slot-mode/)

    assert.ok(assets.get('utils.wxs'))
    assert.match(componentTemplate, /<template is="{{'tmpl_0_' \+ i\.nn}}" data="{{i:i,c:1,l:xs\.f\('',i\.nn\)}}" \/>/)
    assert.doesNotMatch(componentTemplate, /appData|appRoot|slotMode/)
    assert.deepEqual(JSON.parse(assets.get('comp.json') ?? ''), {
        component: true,
        styleIsolation: 'apply-shared',
        usingComponents: {
            comp: './comp'
        }
    })
    assert.match(homeTemplate, /\.\.\/\.\.\/base\.wxml/)
    assert.match(homeTemplate, /<comp i="{{app}}">\s*<template is="taro_tmpl" data="{{root:page}}" \/>\s*<\/comp>/)
    assert.doesNotMatch(homeTemplate, /root:root/)
    assert.equal(assets.get('pages/home/index.wxss'), '')
    assert.match(assets.get('pages/account/index.wxml') ?? '', /\.\.\/\.\.\/base\.wxml/)
    assert.equal(assets.get('pages/account/index.wxss'), '')
})
