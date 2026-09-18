import assert from 'node:assert/strict'
import test from 'node:test'
import { specializeAppCapsule } from './specialize-app-capsule.ts'

const id = '/plugin/runtime/mini/capsule/app.js'
const source = 'export default createReactApp(AppComponent, React, ReactDOM, __VPT_APP_CONFIG__)'

test('specializes the App capsule with its native configuration', () => {
    const result = specializeAppCapsule({
        code: source,
        id,
        sourcemap: true,
        appConfig: {
            pages: ['pages/home/index'],
            window: {
                navigationBarTitleText: 'Example'
            }
        }
    })

    assert.match(result.code, /"pages":\s*\[\s*["']pages\/home\/index["']/)
    assert.match(result.code, /"navigationBarTitleText":\s*["']Example["']/)
    assert.doesNotMatch(result.code, /__VPT_APP_CONFIG__/)
    assert.ok(result.map)
    assert.deepEqual(result.map.sources, [id])
    assert.deepEqual(result.map.sourcesContent, [source])
    assert.ok(result.map.mappings)

    const withoutSourceMap = specializeAppCapsule({ code: source, id, appConfig: {}, sourcemap: false })
    assert.equal(withoutSourceMap.map, null)
})

test('normalizes App configuration as JSON while preserving reserved slot names and escaped characters', () => {
    const appConfig = {
        text: '__VPT_APP_CONFIG__ " \\ \n',
        values: [true, null, -0],
        absent: undefined
    }
    const result = specializeAppCapsule({ code: 'const config = __VPT_APP_CONFIG__', id, appConfig })
    const config: unknown = Function(`${result.code}; return config`)()
    assert.deepEqual(config, { text: appConfig.text, values: [true, null, 0] })
    assert.equal(result.map, null)
})

test('rejects an App capsule missing its configuration placeholder', () => {
    assert.throws(
        () =>
            specializeAppCapsule({
                code: 'export default {}',
                id,
                appConfig: {}
            }),
        /Expected one placeholder __VPT_APP_CONFIG__, found 0/
    )
})
