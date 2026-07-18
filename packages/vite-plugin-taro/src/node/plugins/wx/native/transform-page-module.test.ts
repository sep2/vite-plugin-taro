import assert from 'node:assert/strict'
import test from 'node:test'
import { transformPageModule } from './transform-page-module.ts'

const source = `import './app-module.js'
import { createPageConfig } from './taro-runtime.js'
import PageComponent from '\0vpt:page-component'
export default createPageConfig(PageComponent, __VITE_PLUGIN_TARO_PAGE_PATH__, undefined, __VITE_PLUGIN_TARO_PAGE_CONFIG__)`

test('specializes the real Page module for one route', async () => {
    const id = '/plugin/runtime/wx/page-module.js?route=pages%2Fhome%2Findex'
    const result = await transformPageModule({
        code: source,
        id,
        page: {
            path: 'pages/home/index',
            config: {
                navigationBarTitleText: 'Home'
            }
        }
    })

    assert.match(result.code, /vpt:page-component/)
    assert.match(result.code, /["']pages\/home\/index["']/)
    assert.match(result.code, /navigationBarTitleText:\s*["']Home["']/)
    assert.doesNotMatch(result.code, /__VITE_PLUGIN_TARO_PAGE_/)
    assert.deepEqual(result.map.sources, [id])
})

test('rejects a Page module missing its specialization placeholders', async () => {
    await assert.rejects(
        () =>
            transformPageModule({
                code: 'export default {}',
                id: '/plugin/runtime/wx/page-module.js?route=pages%2Fhome%2Findex',
                page: {
                    path: 'pages/home/index',
                    config: {}
                }
            }),
        /Expected one placeholder __VITE_PLUGIN_TARO_PAGE_PATH__, found 0/
    )
})
