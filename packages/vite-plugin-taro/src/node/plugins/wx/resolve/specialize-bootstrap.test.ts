import assert from 'node:assert/strict'
import test from 'node:test'
import { specializeBootstrap } from './specialize-bootstrap.ts'

const id = '/plugin/runtime/wx/amphibious/bootstrap.js'
const source = 'export const appConfig = __VITE_PLUGIN_TARO_APP_CONFIG__'

test('specializes the amphibious bootstrap with the App configuration', async () => {
    const result = await specializeBootstrap({
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

test('rejects a bootstrap missing its App configuration placeholder', async () => {
    await assert.rejects(
        () =>
            specializeBootstrap({
                code: 'export const appConfig = {}',
                id,
                appConfig: {}
            }),
        /Expected one placeholder __VITE_PLUGIN_TARO_APP_CONFIG__, found 0/
    )
})
