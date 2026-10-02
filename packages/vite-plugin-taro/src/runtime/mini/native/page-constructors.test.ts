import assert from 'node:assert/strict'
import test from 'node:test'
import type { PageInstance } from 'vite-plugin-taro-runtime/runtime/mini'
import miniPageComponentConstructor from './mini-page-component-constructor.ts'

test('the Alipay page constructor is the native Page function and forwards the config unchanged', async (t) => {
    const page = t.mock.fn<(config: object) => void>()
    // Install the native global before importing its alias; remove the stub when the test finishes.
    Reflect.set(globalThis, 'Page', page)
    t.after(() => Reflect.deleteProperty(globalThis, 'Page'))
    const { default: minPageConstructor } = await import('./min-page-constructor.ts')
    const config = Object.freeze({
        data: { count: 0 },
        options: { multipleSlots: true },
        events: { onBack: () => true },
        onLoad: t.mock.fn<() => void>()
    } satisfies PageInstance)

    assert.strictEqual(minPageConstructor, page)
    minPageConstructor(config)

    assert.equal(page.mock.callCount(), 1)
    assert.strictEqual(page.mock.calls[0]?.arguments[0], config)
    assert.equal(config.onLoad.mock.callCount(), 0)
})

test('the WX/TT page constructor separates data and options from methods without mutating the config', (t) => {
    const component = t.mock.fn<(config: object) => void>()
    // Model the native registration boundary without booting Taro or leaking a global into another test.
    Reflect.set(globalThis, 'Component', component)
    t.after(() => Reflect.deleteProperty(globalThis, 'Component'))
    const data = { count: 0 }
    const options = { multipleSlots: true }
    const methods = {
        onLoad: t.mock.fn<() => void>(),
        onShow: t.mock.fn<() => void>(),
        onUnload: t.mock.fn<() => void>(),
        onShareAppMessage: t.mock.fn(() => ({ title: 'Shared page' })),
        eh: t.mock.fn<() => void>()
    }
    const config = Object.freeze({ data, options, ...methods } satisfies PageInstance)

    miniPageComponentConstructor(config)

    assert.equal(component.mock.callCount(), 1)
    const registered = component.mock.calls[0]?.arguments[0]
    assert.deepEqual(registered, { data, options, methods })
    assert.ok(registered && 'data' in registered && 'options' in registered && 'methods' in registered)
    assert.strictEqual(registered.data, data)
    assert.strictEqual(registered.options, options)
    assert.notStrictEqual(registered.methods, config)
    for (const method of Object.values(methods)) {
        assert.equal(method.mock.callCount(), 0, 'registration must not invoke lifecycles or event handlers')
    }
})
