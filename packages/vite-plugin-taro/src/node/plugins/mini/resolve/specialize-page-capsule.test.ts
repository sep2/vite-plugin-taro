import assert from 'node:assert/strict'
import test from 'node:test'
import { specializePageCapsule } from './specialize-page-capsule.ts'

const source = `import './app.js'
import { createPageConfig } from './taro-runtime.js'
import PageComponent from '\0vpt:page-component'
export default createPageConfig(PageComponent, __VPT_PAGE_PATH__, undefined, __VPT_PAGE_CONFIG__)`

test('specializes the Page capsule for one route', () => {
    const id = '/plugin/runtime/mini/capsule/page.js?route=pages%2Fhome%2Findex'
    const result = specializePageCapsule({
        code: source,
        id,
        sourcemap: true,
        page: {
            path: 'pages/home/index',
            config: {
                navigationBarTitleText: 'Home'
            }
        }
    })

    assert.match(result.code, /vpt:page-component/)
    assert.match(result.code, /["']pages\/home\/index["']/)
    assert.match(result.code, /"navigationBarTitleText":\s*["']Home["']/)
    assert.doesNotMatch(result.code, /__VPT_PAGE_/)
    assert.ok(result.map)
    assert.deepEqual(result.map.sources, [id])
    assert.deepEqual(result.map.sourcesContent, [source])
    assert.ok(result.map.mappings)
})

test('specializes an omitted Page configuration as an empty object', () => {
    const result = specializePageCapsule({
        code: source,
        id: '/plugin/runtime/mini/capsule/page.js?route=pages%2Fplain%2Findex',
        page: {
            path: 'pages/plain/index'
        }
    })

    assert.match(result.code, /["']pages\/plain\/index["'], undefined, \{\}/)
    assert.equal(result.map, null)
})

test('preserves Page paths and configuration containing quotes and other reserved slot names', () => {
    const page = {
        path: 'pages/"__VPT_PAGE_CONFIG__/index',
        config: { title: '__VPT_PAGE_PATH__\n', absent: undefined }
    }
    const result = specializePageCapsule({
        code: 'const args = [__VPT_PAGE_PATH__, __VPT_PAGE_CONFIG__]',
        id: '/runtime/page.ts',
        page,
        sourcemap: false
    })
    const args: unknown = Function(`${result.code}; return args`)()
    assert.deepEqual(args, [page.path, { title: page.config.title }])
    assert.equal(result.map, null)
})

test('rejects a Page capsule missing its specialization placeholders', () => {
    assert.throws(
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
