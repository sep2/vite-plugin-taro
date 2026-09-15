import assert from 'node:assert/strict'
import test from 'node:test'
import { polyfillQueueMicrotask } from './polyfill-queue-microtask.ts'

test('polyfills one Promise microtask primitive without replacing a native implementation', async () => {
    const nativeQueueMicrotask = () => {}
    const nativeGlobal = { queueMicrotask: nativeQueueMicrotask }

    polyfillQueueMicrotask(nativeGlobal)

    assert.strictEqual(nativeGlobal.queueMicrotask, nativeQueueMicrotask)

    // This isolated host object receives the fallback without mutating the test runner's globals.
    const runtimeGlobal: { queueMicrotask?: (callback: () => void) => void } = {}
    polyfillQueueMicrotask(runtimeGlobal)
    const installedQueueMicrotask = runtimeGlobal.queueMicrotask
    assert.ok(installedQueueMicrotask)

    // This mutable journal verifies asynchronous FIFO ordering through the shared Promise microtask queue.
    const executionOrder = ['synchronous']
    installedQueueMicrotask(() => executionOrder.push('first'))
    installedQueueMicrotask(() => executionOrder.push('second'))
    executionOrder.push('after-schedule')
    assert.deepEqual(executionOrder, ['synchronous', 'after-schedule'])

    await Promise.resolve()

    assert.deepEqual(executionOrder, ['synchronous', 'after-schedule', 'first', 'second'])

    polyfillQueueMicrotask(runtimeGlobal)
    assert.strictEqual(runtimeGlobal.queueMicrotask, installedQueueMicrotask)
})
