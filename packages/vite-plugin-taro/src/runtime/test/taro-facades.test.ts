import assert from 'node:assert/strict'
import test from 'node:test'
import {
    bundleRuntimeEntry,
    createExecutionContext,
    executeRuntimeEntry,
    importRuntimeFacade
} from './runtime-entry-test-utils.ts'

test('attaches Mini hooks to the original API object without invoking platform APIs', async () => {
    const showToast = () => assert.fail('The Mini facade must not invoke native APIs during initialization')
    const useLaunch = () => undefined
    const View = { kind: 'View' }
    // This local trace records initialization once per dependency without invoking any exported API.
    const events: string[] = []
    const options = {}
    // Only the isolated backend fixture is augmented with framework hooks during facade evaluation.
    const taro = { showToast, options }
    const harness = { taro, showToast, useLaunch, View, events, options }
    const apiCode = await bundleRuntimeEntry({
        entry: 'client/taro/api.ts',
        mocks: {
            'vite-plugin-taro-runtime/taro': `
                globalThis.harness.events.push('backend')
                export default globalThis.harness.taro
                export const options = globalThis.harness.options
                export const showToast = globalThis.harness.showToast
            `,
            './framework-apis.ts': `
                globalThis.harness.events.push('framework')
                export const useLaunch = globalThis.harness.useLaunch
            `
        },
        defines: {}
    })
    const componentExports = await importRuntimeFacade({
        entry: 'client/taro/component.ts',
        mocks: {
            'vite-plugin-taro-runtime/components': 'export const View = globalThis.harness.View'
        },
        harness
    })

    const apiExports = executeRuntimeEntry(apiCode, createExecutionContext(harness))

    assert.deepEqual(events, ['backend', 'framework'])
    assert.strictEqual(apiExports.default, taro)
    assert.strictEqual(Reflect.get(taro, 'useLaunch'), useLaunch)
    assert.strictEqual(taro.options, options)
    assert.strictEqual(apiExports.showToast, showToast)
    assert.strictEqual(apiExports.useLaunch, useLaunch)
    assert.strictEqual(componentExports.View, View)
})
