import assert from 'node:assert/strict'
import test from 'node:test'
import { injectPageHmr } from '../mini/dev/modes/devtools/inject-page-hmr.ts'
import { bundleRuntimeEntry, createExecutionContext, executeRuntimeEntry } from './runtime-entry-test-utils.ts'

test('Component Page hot registration preserves the definition and lifecycle identities', async (t) => {
    const load = t.mock.fn()
    const attached = t.mock.fn()
    const config = Object.freeze({
        methods: Object.freeze({ onLoad: load }),
        lifetimes: Object.freeze({ attached })
    })
    const prepare = t.mock.fn(injectPageHmr)
    const register = t.mock.fn()
    const bundle = await bundleRuntimeEntry({
        entry: 'mini/native/page.ts',
        mocks: {
            '../amphibious/bootstrap.ts': '',
            '\0vpt:page-capsule': 'export default globalThis.harness.config'
        },
        defines: {},
        nativePageHmr: true
    })
    const context = createExecutionContext({ config })
    const sdk = {
        ...context,
        globalThis: { ...context.globalThis, __rolldown_runtime__: { injectPageHmr: prepare } },
        Component: register
    }
    executeRuntimeEntry(bundle, sdk)
    const page = { data: { count: 7 }, groupUpdates() {} }
    config.methods.onLoad.call(page, { id: 'first' })
    executeRuntimeEntry(bundle, sdk)
    assert.equal(register.mock.callCount(), 2)
    for (const call of register.mock.calls) {
        assert.strictEqual(call.arguments[0], config)
    }
    assert.equal(prepare.mock.callCount(), 0)
    assert.strictEqual(config.methods.onLoad, load)
    assert.strictEqual(config.lifetimes.attached, attached)
    assert.equal(attached.mock.callCount(), 0)
    assert.equal(load.mock.callCount(), 1)
    assert.deepEqual(page.data, { count: 7 })
})

for (const nativePageHmr of [false, true]) {
    test(`native registration follows the config shape with HMR=${nativePageHmr}`, async (t) => {
        // Both native config shapes exercise the same compiled registration decision.
        const code = await bundleRuntimeEntry({
            entry: 'mini/native/page.ts',
            mocks: {
                '../amphibious/bootstrap.ts': '',
                '\0vpt:page-capsule': 'export default globalThis.harness.config'
            },
            defines: {},
            nativePageHmr
        })
        for (const registration of ['Page', 'Component']) {
            await t.test(registration, (t) => {
                const load = t.mock.fn()
                const attached = t.mock.fn()
                const config =
                    registration === 'Component'
                        ? { methods: { onLoad: load }, lifetimes: { attached } }
                        : { data: {}, onLoad: load }
                const register = t.mock.fn()
                const prepare = t.mock.fn(injectPageHmr)
                const context = createExecutionContext({ config })
                executeRuntimeEntry(code, {
                    ...context,
                    globalThis: { ...context.globalThis, __rolldown_runtime__: { injectPageHmr: prepare } },
                    [registration]: register
                })
                assert.equal(register.mock.callCount(), 1)
                assert.equal(prepare.mock.callCount(), nativePageHmr && registration === 'Page' ? 1 : 0)
                assert.strictEqual(register.mock.calls[0]?.arguments[0], config)
                assert.equal(load.mock.callCount(), 0)
                assert.equal(attached.mock.callCount(), 0)
            })
        }
    })
}
