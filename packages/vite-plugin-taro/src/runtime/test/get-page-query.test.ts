import assert from 'node:assert/strict'
import test from 'node:test'
import type { getPageQuery } from '../mini/taro/get-page-query.ts'
import { bundleRuntimeEntry, createExecutionContext, executeRuntimeEntry } from './runtime-entry-test-utils.ts'

test('native query capture reads routing events when the host provides its API', async () => {
    const initialQuery: ReturnType<typeof getPageQuery> = undefined
    const code = await bundleRuntimeEntry({
        entry: 'mini/taro/get-page-query.ts',
        mocks: {},
        defines: {}
    })
    for (const wx of [undefined, {}]) {
        const { getPageQuery } = executeRuntimeEntry(code, { ...createExecutionContext({}), wx })
        assert.ok(typeof getPageQuery === 'function')
        assert.equal(getPageQuery(), initialQuery)
    }

    // Capture the host callback so routing can arrive after module initialization.
    const listeners: ((event: { query: Record<string, unknown> }) => void)[] = []
    const exports = executeRuntimeEntry(code, {
        ...createExecutionContext({}),
        wx: { onBeforePageLoad: (listener: (typeof listeners)[number]) => listeners.push(listener) }
    })
    const readQuery = exports.getPageQuery
    assert.ok(typeof readQuery === 'function')
    assert.equal(readQuery(), initialQuery)
    assert.equal(listeners.length, 1)
    const captureQuery = listeners[0]
    assert.ok(captureQuery)
    for (const query of [{ id: 'first', scene: 'a=b' }, {}, { id: 'second' }]) {
        captureQuery({ query })
        assert.strictEqual(readQuery(), query, 'query capture preserves the complete native object')
    }
})

test('disposes only its own native query listener when the module is hot-replaced', async () => {
    type Listener = (event: { query: Record<string, unknown> }) => void
    const unrelatedListener: Listener = () => {}
    // The host owns active listeners; the test invokes each generation's registered HMR disposal callback.
    const listeners = new Set<Listener>([unrelatedListener])
    const disposals: (() => void)[] = []
    const code = await bundleRuntimeEntry({
        entry: 'mini/taro/get-page-query.ts',
        mocks: {},
        defines: { 'import.meta.hot': 'globalThis.harness.hot' }
    })
    const context = {
        ...createExecutionContext({ hot: { dispose: (callback: () => void) => disposals.push(callback) } }),
        wx: {
            onBeforePageLoad(listener: Listener) {
                listeners.add(listener)
            },
            offBeforePageLoad(listener: Listener) {
                assert.notStrictEqual(listener, unrelatedListener)
                assert.equal(listeners.delete(listener), true, 'cleanup uses the registered callback reference')
            }
        }
    }
    for (const id of ['initial', 'replacement']) {
        const { getPageQuery } = executeRuntimeEntry(code, context)
        assert.ok(typeof getPageQuery === 'function')
        assert.equal(listeners.size, 2, 'each generation installs exactly one listener')
        assert.equal(getPageQuery(), undefined, 'native routing has not supplied a query to this generation')
        const query = { id }
        for (const listener of listeners) {
            listener({ query })
        }
        assert.strictEqual(getPageQuery(), query)
        assert.equal(disposals.length, 1)
        const dispose = disposals.pop()
        assert.ok(dispose)
        dispose()
        assert.deepEqual([...listeners], [unrelatedListener])
    }
})
