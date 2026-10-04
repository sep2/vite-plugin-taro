import assert from 'node:assert/strict'
import test from 'node:test'
import type { PageInstance } from 'vite-plugin-taro-runtime/runtime/mini'

test('the Alipay/TT constructor is native Page and forwards the config without consuming metadata', async (t) => {
    const page = t.mock.fn<(config: object) => void>()
    // Install the native global before importing its alias; remove the stub when the test finishes.
    Reflect.set(globalThis, 'Page', page)
    t.after(() => Reflect.deleteProperty(globalThis, 'Page'))
    const { default: miniPageConstructor } = await import('./mini-page-constructor.ts')
    const config = {
        data: { count: 0 },
        options: { multipleSlots: true },
        events: { onBack: () => true },
        onLoad: t.mock.fn<() => void>()
    } satisfies PageInstance
    const metadata = { component: () => null, route: 'pages/home', initialPage: undefined, isReregistering: false }
    Object.defineProperty(config, '__vpt_meta', { value: metadata, enumerable: false })
    Object.freeze(config)

    assert.strictEqual(miniPageConstructor, page)
    miniPageConstructor(config)

    assert.equal(page.mock.callCount(), 1)
    assert.strictEqual(page.mock.calls[0]?.arguments[0], config)
    assert.equal(config.onLoad.mock.callCount(), 0)
    assert.equal(metadata.initialPage, undefined)
    assert.equal(metadata.isReregistering, false)
    assert.equal(Object.hasOwn({ ...config }, '__vpt_meta'), false)
})
