import assert from 'node:assert/strict'
import test from 'node:test'
import type { Rolldown } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { createTemplateAssets } from './create-template-assets.ts'

const options: VitePluginTaroOptions = {
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

test('creates shared Taro templates and one native facade per Page', () => {
    const assets = new Map(
        createTemplateAssets({} as Rolldown.OutputBundle, options).map((asset) => [
            asset.fileName,
            String(asset.source)
        ])
    )

    assert.deepEqual(
        [...assets.keys()],
        [
            'app.wxss',
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
    assert.equal(assets.get('app.wxss'), '')
    assert.ok(assets.get('base.wxml'))
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
