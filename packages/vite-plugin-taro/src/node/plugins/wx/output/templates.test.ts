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
            fields: ['count', 'label', 'onIncrement']
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
    assert.match(assets.get('base.wxml') ?? '', /<template name="tmpl_0_native-counter">/)
    assert.match(
        assets.get('base.wxml') ?? '',
        /<native-counter\s+count="{{i\.count}}" label="{{i\.label}}" bindincrement="eh"/
    )
    assert.ok(assets.get('utils.wxs'))
    assert.ok(assets.get('comp.wxml'))
    assert.deepEqual(JSON.parse(assets.get('comp.json') ?? ''), {
        component: true,
        styleIsolation: 'apply-shared',
        usingComponents: {
            comp: './comp'
        }
    })
    assert.match(assets.get('pages/home/index.wxml') ?? '', /\.\.\/\.\.\/base\.wxml/)
    assert.equal(assets.get('pages/home/index.wxss'), '')
    assert.match(assets.get('pages/account/index.wxml') ?? '', /\.\.\/\.\.\/base\.wxml/)
    assert.equal(assets.get('pages/account/index.wxss'), '')
})
