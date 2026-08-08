import assert from 'node:assert/strict'
import test from 'node:test'
import { SerializedTaskQueue } from './serialized-task-queue.ts'

test('runs caller-owned tasks in insertion order', async () => {
    const queue = new SerializedTaskQueue(() => {})
    const firstGate = Promise.withResolvers<void>()
    const events: string[] = []

    const first = queue.run(async () => {
        events.push('first:start')
        await firstGate.promise
        events.push('first:end')
        return 1
    })
    const second = queue.run(async () => {
        events.push('second')
        return 2
    })

    await Promise.resolve()
    assert.deepEqual(events, ['first:start'])
    firstGate.resolve()

    assert.deepEqual(await Promise.all([first, second]), [1, 2])
    assert.deepEqual(events, ['first:start', 'first:end', 'second'])
})

test('continues after a caller-owned task fails', async () => {
    const queue = new SerializedTaskQueue(() => {})
    const failed = queue.run(async () => {
        throw new Error('expected')
    })
    const next = queue.run(async () => 'next')

    await assert.rejects(failed, /expected/)
    assert.equal(await next, 'next')
})

test('reports background failures and reaches idle', async () => {
    const failures: Array<{ operation: string; error: unknown }> = []
    const queue = new SerializedTaskQueue((operation, error) => {
        failures.push({ operation, error })
    })

    queue.enqueue('publish patch', async () => {
        throw new Error('write failed')
    })
    await queue.waitForIdle()

    assert.equal(failures.length, 1)
    assert.equal(failures[0].operation, 'publish patch')
    assert.match(String(failures[0].error), /write failed/)
})
