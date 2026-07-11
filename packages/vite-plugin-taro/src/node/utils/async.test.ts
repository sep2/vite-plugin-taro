import assert from 'node:assert/strict'
import test from 'node:test'
import { SerializedTaskQueue } from './async.ts'

test('serializes tasks behind a pending predecessor', async () => {
    const first = Promise.withResolvers<void>()
    const order: string[] = []
    const errors: unknown[] = []
    const queue = new SerializedTaskQueue((error) => errors.push(error))

    const firstWork = queue.enqueue(async () => {
        order.push('first:start')
        await first.promise
        order.push('first:end')
    })
    const secondWork = queue.enqueue(async () => {
        order.push('second')
    })

    await Promise.resolve()
    assert.deepEqual(order, ['first:start'])
    first.resolve()
    await Promise.all([firstWork, secondWork])
    assert.deepEqual(order, ['first:start', 'first:end', 'second'])
    assert.deepEqual(errors, [])
})
