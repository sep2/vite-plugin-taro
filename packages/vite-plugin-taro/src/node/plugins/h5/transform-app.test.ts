import assert from 'node:assert/strict'
import test from 'node:test'
import type { VitePluginTaroOptions } from '../../../options.ts'
import { transformH5App } from './transform-app.ts'

const options: VitePluginTaroOptions = {
    target: 'h5',
    app: 'src/app.tsx',
    pages: [
        {
            path: 'pages/home/index',
            config: {
                navigationBarTitleText: 'Home'
            }
        }
    ],
    appJson: {
        pages: ['stale/page'],
        window: {
            navigationBarTitleText: 'Example'
        }
    },
    projectConfigJson: {},
    sitemapJson: {}
}

const id = '/plugin/runtime/h5/app.js'
const source = `const config = __VITE_PLUGIN_TARO_H5_APP_CONFIG__
config.routes = __VITE_PLUGIN_TARO_H5_ROUTES__
`

test('specializes the physical H5 App configuration and routes', async () => {
    const result = await transformH5App({
        code: source,
        id,
        options,
        projectRoot: '/project'
    })

    assert.match(result.code, /router: \{\}/)
    assert.match(result.code, /pages: \[\s*["']pages\/home\/index["']/)
    assert.doesNotMatch(result.code, /stale\/page/)
    assert.match(result.code, /path: ["']pages\/home\/index["']/)
    assert.match(result.code, /navigationBarTitleText: ["']Home["']/)
    assert.match(result.code, /import\(["']\/@fs\/\/project\/src\/pages\/home\/index\.tsx["']\)/)
    assert.ok(result.map)
    assert.equal(result.map.sources?.[0], id)
})

test('rejects an H5 App missing its specialization placeholders', async () => {
    await assert.rejects(
        () =>
            transformH5App({
                code: 'export default {}',
                id,
                options,
                projectRoot: '/project'
            }),
        /Expected one placeholder __VITE_PLUGIN_TARO_H5_APP_CONFIG__, found 0/
    )
})
