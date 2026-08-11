import assert from 'node:assert/strict'
import test from 'node:test'
import { createHostActions } from './host-actions.ts'

type TestAction = Readonly<{
    name: string
    run: () => void | Promise<void>
}>

function createProbe(): Readonly<{
    actions: ReturnType<typeof createHostActions<TestAction>>
    failures: string[]
}> {
    // This failure journal records reducer errors without coupling assertions to logger formatting.
    const failures: string[] = []
    const actions = createHostActions<TestAction>(
        (action) => action.run(),
        (action) => {
            failures.push(action.name)
        }
    )
    return { actions: actions, failures: failures }
}

test('serializes asynchronous effects in admission order', async () => {
    const { actions, failures } = createProbe()
    const gate = Promise.withResolvers<void>()
    // The operation journal proves the second reducer cannot start while the first Promise is unresolved.
    const operations: string[] = []
    actions.next({
        name: 'first',
        async run() {
            operations.push('first:start')
            await gate.promise
            operations.push('first:end')
        }
    })
    actions.next({
        name: 'second',
        run() {
            operations.push('second')
        }
    })

    await Promise.resolve()
    assert.deepEqual(operations, ['first:start'])
    gate.resolve()
    await actions.waitForIdle()

    assert.deepEqual(operations, ['first:start', 'first:end', 'second'])
    assert.deepEqual(failures, [])
    await actions.complete()
})

test('reports one failed effect and continues with later actions', async () => {
    const { actions, failures } = createProbe()
    const operations: string[] = []
    actions.next({
        name: 'failed',
        run() {
            throw new Error('expected failure')
        }
    })
    actions.next({
        name: 'healthy',
        run() {
            operations.push('healthy')
        }
    })

    await actions.waitForIdle()

    assert.deepEqual(failures, ['failed'])
    assert.deepEqual(operations, ['healthy'])
    await actions.complete()
})

test('completion waits for every action admitted before source shutdown', async () => {
    const { actions } = createProbe()
    const gate = Promise.withResolvers<void>()
    // This flag changes only from the completion continuation and exposes whether complete returned prematurely.
    let completed = false
    actions.next({ name: 'pending', run: () => gate.promise })

    const completion = actions.complete().then(() => {
        completed = true
    })
    await Promise.resolve()
    assert.equal(completed, false)

    gate.resolve()
    await completion
    assert.equal(completed, true)
})
