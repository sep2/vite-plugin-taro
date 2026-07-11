import assert from 'node:assert/strict'
import test from 'node:test'
import { createWxUpdateClientState, transitionWxUpdateClient, type WxUpdateClientEvent } from './update-client-state.ts'

type WxUpdateClientState = ReturnType<typeof createWxUpdateClientState>

function run(state: WxUpdateClientState, event: WxUpdateClientEvent) {
    return transitionWxUpdateClient(state, event)
}

function start(): WxUpdateClientState {
    const registering = run(createWxUpdateClientState('build-1'), { type: 'started' }).state
    return run(registering, { type: 'registration-completed' }).state
}

test('registers before starting its polling loop', () => {
    const initial = createWxUpdateClientState('build-1')
    const started = run(initial, { type: 'started' })

    assert.equal(started.state.phase, 'registering')
    assert.deepEqual(started.commands, [{ type: 'register', version: 0 }])

    const registered = run(started.state, { type: 'registration-completed' })
    assert.equal(registered.state.phase, 'polling')
    assert.deepEqual(registered.commands, [{ type: 'poll', version: 0 }])
})

test('queues an initial replay batch until registration completes', () => {
    const started = run(createWxUpdateClientState('build-1'), { type: 'started' }).state
    const observed = run(started, {
        type: 'batch-observed',
        buildId: 'build-1',
        fromVersion: 0,
        targetVersion: 3
    })
    assert.equal(observed.state.phase, 'registering')
    assert.deepEqual(observed.commands, [])

    const registered = run(observed.state, { type: 'registration-completed' })
    assert.equal(registered.state.phase, 'applying')
    assert.deepEqual(registered.commands, [{ type: 'apply-batch', fromVersion: 0, targetVersion: 3 }])
})

test('ignores a stale disk batch without aborting registration', () => {
    const started = run(createWxUpdateClientState('build-1'), { type: 'started' }).state
    const stale = run(started, {
        type: 'batch-observed',
        buildId: 'build-1',
        fromVersion: 3,
        targetVersion: 4
    })
    assert.equal(stale.state.phase, 'registering')
    assert.deepEqual(stale.commands, [])

    const registered = run(stale.state, { type: 'registration-completed' })
    assert.equal(registered.state.phase, 'polling')
    assert.deepEqual(registered.commands, [{ type: 'poll', version: 0 }])
})

test('does not start a second transport loop', () => {
    const state = start()
    assert.deepEqual(run(state, { type: 'started' }).commands, [])
})

test('continues polling after an empty poll completes', () => {
    const state = start()
    assert.deepEqual(run(state, { type: 'poll-completed' }).commands, [{ type: 'poll', version: 0 }])
})

test('accepts a batch beginning at the current version', () => {
    const result = run(start(), {
        type: 'batch-observed',
        buildId: 'build-1',
        fromVersion: 0,
        targetVersion: 3
    })

    assert.equal(result.state.phase, 'applying')
    assert.equal(result.state.targetVersion, 3)
    assert.deepEqual(result.commands, [{ type: 'apply-batch', fromVersion: 0, targetVersion: 3 }])
})

test('acknowledges only after patch execution and React Refresh complete', () => {
    let state = run(start(), {
        type: 'batch-observed',
        buildId: 'build-1',
        fromVersion: 0,
        targetVersion: 2
    }).state
    const executed = run(state, { type: 'batch-executed', targetVersion: 2 })
    assert.equal(executed.state.version, 2)
    assert.equal(executed.state.phase, 'refreshing')
    assert.deepEqual(executed.commands, [])

    state = executed.state
    const refreshed = run(state, { type: 'refresh-completed', stale: false })
    assert.equal(refreshed.state.phase, 'polling')
    assert.deepEqual(refreshed.commands, [{ type: 'report-version', version: 2, reason: 'applied' }])
})

test('waits for a relaunched stale-family route before acknowledging', () => {
    let state = run(start(), {
        type: 'batch-observed',
        buildId: 'build-1',
        fromVersion: 0,
        targetVersion: 1
    }).state
    state = run(state, { type: 'batch-executed', targetVersion: 1 }).state

    const stale = run(state, { type: 'refresh-completed', stale: true })
    assert.equal(stale.state.phase, 'relaunching')
    assert.deepEqual(stale.commands, [])

    const ready = run(stale.state, { type: 'route-ready' })
    assert.deepEqual(ready.commands, [{ type: 'report-version', version: 1, reason: 'applied' }])
})

test('treats an already-applied batch as an idempotent acknowledgement', () => {
    const state = { ...start(), version: 4 }
    const result = run(state, {
        type: 'batch-observed',
        buildId: 'build-1',
        fromVersion: 2,
        targetVersion: 4
    })

    assert.deepEqual(result.commands, [{ type: 'report-version', version: 4, reason: 'applied' }])
})

test('reports its actual version for gaps, stale builds, and malformed batches', () => {
    const state = { ...start(), version: 2 }
    for (const batch of [
        { buildId: 'build-1', fromVersion: 1, targetVersion: 4 },
        { buildId: 'old-build', fromVersion: 2, targetVersion: 4 },
        { buildId: 'build-1', fromVersion: -1, targetVersion: 4 },
        { buildId: 'build-1', fromVersion: 2, targetVersion: 2 }
    ]) {
        const result = run(state, { type: 'batch-observed', ...batch })
        assert.deepEqual(result.commands, [{ type: 'report-version', version: 2, reason: 'batch-mismatch' }])
    }
})

test('does not apply a second batch while applying or refreshing', () => {
    let state = run(start(), {
        type: 'batch-observed',
        buildId: 'build-1',
        fromVersion: 0,
        targetVersion: 1
    }).state

    const applying = run(state, {
        type: 'batch-observed',
        buildId: 'build-1',
        fromVersion: 0,
        targetVersion: 2
    })
    assert.deepEqual(applying.commands, [{ type: 'report-version', version: 0, reason: 'batch-mismatch' }])

    state = run(state, { type: 'batch-executed', targetVersion: 1 }).state
    const refreshing = run(state, {
        type: 'batch-observed',
        buildId: 'build-1',
        fromVersion: 1,
        targetVersion: 2
    })
    assert.deepEqual(refreshing.commands, [{ type: 'report-version', version: 1, reason: 'batch-mismatch' }])
})

test('requests a full build when literal batch execution throws', () => {
    const state = run(start(), {
        type: 'batch-observed',
        buildId: 'build-1',
        fromVersion: 0,
        targetVersion: 1
    }).state
    const failed = run(state, { type: 'batch-failed' })

    assert.equal(failed.state.phase, 'polling')
    assert.deepEqual(failed.commands, [{ type: 'request-full-build', reason: 'batch-execution-failed' }])
})

test('rejects an execution completion for the wrong target', () => {
    const state = run(start(), {
        type: 'batch-observed',
        buildId: 'build-1',
        fromVersion: 0,
        targetVersion: 2
    }).state
    const result = run(state, { type: 'batch-executed', targetVersion: 3 })
    assert.deepEqual(result.commands, [{ type: 'report-version', version: 0, reason: 'batch-mismatch' }])
})

test('retries transport failures without changing protocol state', () => {
    const state = start()
    const result = run(state, { type: 'transport-failed' })
    assert.deepEqual(result.state, state)
    assert.deepEqual(result.commands, [{ type: 'retry-transport' }])
})
