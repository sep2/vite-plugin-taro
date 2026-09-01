import assert from 'node:assert/strict'
import test from 'node:test'
import { specializeAppCapsule } from './specialize-app-capsule.ts'

const id = '/plugin/runtime/wx/capsule/app.js'
const source = 'export default createReactApp(AppComponent, React, ReactDOM, __VPT_APP_CONFIG__)'

test('specializes the App capsule with its native configuration', async () => {
    const result = await specializeAppCapsule({
        code: source,
        id,
        appConfig: {
            pages: ['pages/home/index'],
            window: {
                navigationBarTitleText: 'Example'
            }
        }
    })

    assert.match(result.code, /pages:\s*\[\s*["']pages\/home\/index["']/)
    assert.match(result.code, /navigationBarTitleText:\s*["']Example["']/)
    assert.doesNotMatch(result.code, /__VPT_APP_CONFIG__/)
    assert.ok(result.map)
    assert.deepEqual(result.map.sources, [id])

    const withoutSourceMap = await specializeAppCapsule({ code: source, id, appConfig: {}, sourcemap: false })
    assert.equal(withoutSourceMap.map, null)
})

test('rejects an App capsule missing its configuration placeholder', async () => {
    await assert.rejects(
        () =>
            specializeAppCapsule({
                code: 'export default {}',
                id,
                appConfig: {}
            }),
        /Expected one placeholder __VPT_APP_CONFIG__, found 0/
    )
})
