import assert from 'node:assert/strict'
import test from 'node:test'
import { transformBootstrapModule } from './transform-bootstrap-module.ts'

const id = '/plugin/runtime/wx/bootstrap.js'
const source = 'export const appConfig = __VITE_PLUGIN_TARO_APP_CONFIG__'

test('specializes the native bootstrap with the App configuration', async () => {
    const result = await transformBootstrapModule({
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
    assert.doesNotMatch(result.code, /__VITE_PLUGIN_TARO_APP_CONFIG__/)
    assert.deepEqual(result.map.sources, [id])
})

test('rejects a bootstrap module missing its App configuration placeholder', async () => {
    await assert.rejects(
        () =>
            transformBootstrapModule({
                code: 'export const appConfig = {}',
                id,
                appConfig: {}
            }),
        /Expected one placeholder __VITE_PLUGIN_TARO_APP_CONFIG__, found 0/
    )
})
