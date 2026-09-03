import assert from 'node:assert/strict'
import test from 'node:test'
import { specializePageCapsule } from './specialize-page-capsule.ts'

const source = `import './app.js'
import { createPageConfig } from './taro-runtime.js'
import PageComponent from '\0vpt:page-component'
export default createPageConfig(PageComponent, __VPT_PAGE_PATH__, undefined, __VPT_PAGE_CONFIG__)`

test('specializes the Page capsule for one route', async () => {
    const id = '/plugin/runtime/mini/capsule/page.js?route=pages%2Fhome%2Findex'
    const result = await specializePageCapsule({
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
    assert.doesNotMatch(result.code, /__VPT_PAGE_/)
    assert.ok(result.map)
    assert.deepEqual(result.map.sources, [id])
})

test('rejects a Page capsule missing its specialization placeholders', async () => {
    await assert.rejects(
        () =>
            specializePageCapsule({
                code: 'export default {}',
                id: '/plugin/runtime/mini/capsule/page.js?route=pages%2Fhome%2Findex',
                page: {
                    path: 'pages/home/index',
                    config: {}
                }
            }),
        /Expected one placeholder __VPT_PAGE_PATH__, found 0/
    )
})
