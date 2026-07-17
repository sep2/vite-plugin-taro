import assert from 'node:assert/strict'
import test from 'node:test'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { createJsonAssets } from './create-json-assets.ts'

const options: VitePluginTaroOptions = {
    target: 'wx',
    app: 'src/app.tsx',
    pages: [
        {
            path: 'pages/home/index',
            config: {
                navigationBarTitleText: 'Home'
            }
        },
        {
            path: 'pages/account/index',
            config: {
                navigationBarTitleText: 'Account'
            }
        }
    ],
    appJson: {
        pages: ['stale/index'],
        window: {
            navigationBarTitleText: 'Example'
        }
    },
    projectConfigJson: {
        appid: 'wx-example'
    },
    projectPrivateConfigJson: {
        setting: {
            compileHotReLoad: true
        }
    },
    sitemapJson: {
        rules: []
    }
}

test('creates configured native JSON assets at exact output paths', () => {
    const assets = new Map(createJsonAssets(options).map((asset) => [asset.fileName, JSON.parse(String(asset.source))]))

    assert.deepEqual(
        [...assets.keys()],
        [
            'app.json',
            'pages/home/index.json',
            'pages/account/index.json',
            'project.config.json',
            'project.private.config.json',
            'sitemap.json'
        ]
    )
    assert.deepEqual(assets.get('app.json'), {
        pages: ['pages/home/index', 'pages/account/index'],
        window: {
            navigationBarTitleText: 'Example'
        }
    })
    assert.deepEqual(assets.get('pages/home/index.json'), {
        navigationBarTitleText: 'Home'
    })
    assert.deepEqual(assets.get('pages/account/index.json'), {
        navigationBarTitleText: 'Account'
    })
    assert.deepEqual(assets.get('project.config.json'), options.projectConfigJson)
    assert.deepEqual(assets.get('project.private.config.json'), options.projectPrivateConfigJson)
    assert.deepEqual(assets.get('sitemap.json'), options.sitemapJson)
})

test('omits project.private.config.json when it is not configured', () => {
    const assets = createJsonAssets({
        ...options,
        projectPrivateConfigJson: undefined
    })

    assert.equal(
        assets.some((asset) => asset.fileName === 'project.private.config.json'),
        false
    )
})
