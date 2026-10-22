import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { createBenchmarkChannel } from './create-benchmark-channel.ts'

test('the SDK starts after launch acknowledgment and reports results without another automator call', async (t) => {
    const channel = await createBenchmarkChannel()
    t.after(() => channel.close())
    const launch = Promise.withResolvers<void>()
    const entered = Promise.withResolvers<void>()
    // Record transport ordering and own every client request until its response body has drained.
    const events: string[] = []
    const clients: Promise<void>[] = []
    const expected = { status: 'done', value: { samples: [42] } }
    const result = channel.run(
        async (url) => {
            clients.push(
                (async () => {
                    const start = await fetch(url)
                    await start.text()
                    assert.equal(start.status, 200)
                    assert.deepEqual(events, ['launch acknowledged'])
                    const response = await fetch(url, { method: 'POST', body: JSON.stringify(expected) })
                    await response.text()
                    assert.equal(response.status, 200)
                })()
            )
            entered.resolve()
            await launch.promise
            events.push('launch acknowledged')
        },
        new AbortController().signal,
        5000
    )
    await entered.promise
    await setImmediate()
    assert.deepEqual(events, [])
    launch.resolve()
    assert.deepEqual(await result, expected)
    await Promise.all(clients)
})

test('launch failures propagate and release the result token', async (t) => {
    const channel = await createBenchmarkChannel()
    t.after(() => channel.close())
    const error = new Error('automator launch failed')
    await assert.rejects(
        channel.run(
            async () => {
                throw error
            },
            new AbortController().signal,
            5000
        ),
        (value) => value === error
    )
})

test('aborting collection releases an outstanding result wait', async (t) => {
    const channel = await createBenchmarkChannel()
    t.after(() => channel.close())
    const controller = new AbortController()
    const error = new Error('collection interrupted')
    const result = channel.run(async () => true, controller.signal, 5000)
    controller.abort(error)
    await assert.rejects(result, (value) => value === error)
})

test('missing SDK callbacks fail at the collection deadline', async (t) => {
    const channel = await createBenchmarkChannel()
    t.after(() => channel.close())
    await assert.rejects(
        channel.run(async () => true, new AbortController().signal, 20),
        /result callback timed out/
    )
})
