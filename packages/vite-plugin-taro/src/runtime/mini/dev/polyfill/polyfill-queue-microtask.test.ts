import assert from 'node:assert/strict'
import test from 'node:test'
import { polyfillQueueMicrotask } from './polyfill-queue-microtask.ts'

test('polyfills one Promise microtask primitive without replacing a native implementation', async () => {
    const nativeQueueMicrotask = () => {}
    const nativeGlobal = { queueMicrotask: nativeQueueMicrotask }

    polyfillQueueMicrotask(nativeGlobal)

    assert.strictEqual(nativeGlobal.queueMicrotask, nativeQueueMicrotask)

    const runtimeGlobal: { queueMicrotask?: (callback: () => void) => void } = {}
    polyfillQueueMicrotask(runtimeGlobal)
    const installedQueueMicrotask = runtimeGlobal.queueMicrotask
    assert.ok(installedQueueMicrotask)

    // This mutable journal proves the installed callback leaves the current stack and enters the next Promise microtask.
    const executionOrder = ['synchronous']
    installedQueueMicrotask(() => executionOrder.push('microtask'))
    executionOrder.push('after-schedule')
    assert.deepEqual(executionOrder, ['synchronous', 'after-schedule'])

    await Promise.resolve()

    assert.deepEqual(executionOrder, ['synchronous', 'after-schedule', 'microtask'])

    polyfillQueueMicrotask(runtimeGlobal)
    assert.strictEqual(runtimeGlobal.queueMicrotask, installedQueueMicrotask)
})
