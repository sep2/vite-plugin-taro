import assert from 'node:assert/strict'
import test from 'node:test'
import { specializePageCapsule } from './specialize-page-capsule.ts'

const source = `import './app.js'
import { createVptPageConfig } from './create-vpt-page-config.js'
import PageComponent from '\0vpt:page-component'
export default createVptPageConfig(PageComponent, __VPT_PAGE_OPTIONS__)`

test('specializes the Page capsule with one options object', () => {
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

test('preserves omitted native config and defaults prerender to false', () => {
    const result = specializePageCapsule({
        code: 'const options = __VPT_PAGE_OPTIONS__',
        id: '/plugin/runtime/mini/capsule/page.js?route=pages%2Fplain%2Findex',
        page: { path: 'pages/plain/index' }
    })

    const options: unknown = Function(`${result.code}; return options`)()
    assert.deepEqual(options, { path: 'pages/plain/index', prerender: false })
    assert.equal(result.map, null)
})

for (const prerender of [undefined, false, true]) {
    test(`specializes Page prerender=${prerender} independently of native config`, () => {
        const page = {
            path: 'pages/detail/index',
            ...(prerender === undefined ? {} : { prerender }),
            config: { title: 'Detail' }
        }
        const result = specializePageCapsule({
            code: 'const options = __VPT_PAGE_OPTIONS__',
            id: '/runtime/page.ts',
            page
        })
        const options: unknown = Function(`${result.code}; return options`)()
        assert.deepEqual(options, { ...page, prerender: prerender === true })
    })
}

test('preserves quotes and the reserved slot name inside Page options', () => {
    const page = {
        path: 'pages/"__VPT_PAGE_OPTIONS__/index',
        config: { title: '__VPT_PAGE_OPTIONS__\n', absent: undefined }
    }
    const result = specializePageCapsule({
        code: 'const options = __VPT_PAGE_OPTIONS__',
        id: '/runtime/page.ts',
        page,
        sourcemap: false
    })
    const options: unknown = Function(`${result.code}; return options`)()
    assert.deepEqual(options, { path: page.path, config: { title: page.config.title }, prerender: false })
    assert.equal(result.map, null)
})

test('rejects a Page capsule missing its specialization placeholder', () => {
    assert.throws(
        () =>
            specializePageCapsule({
                code: 'export default {}',
                id: '/plugin/runtime/mini/capsule/page.js?route=pages%2Fhome%2Findex',
                page: { path: 'pages/home/index' }
            }),
        /Expected one placeholder __VPT_PAGE_OPTIONS__, found 0/
    )
})
