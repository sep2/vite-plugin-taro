import assert from 'node:assert/strict'
import test from 'node:test'
import {
    createWxUpdateServerState,
    transitionWxUpdateServer,
    type WxUpdateServerEvent,
    type WxUpdateServerState
} from './update-server-state.ts'

function run(state: WxUpdateServerState, event: WxUpdateServerEvent) {
    return transitionWxUpdateServer(state, event)
}

function addDeltas(state: WxUpdateServerState, ...codes: string[]): WxUpdateServerState {
    return codes.reduce((current, code) => run(current, { type: 'delta-added', code }).state, state)
}

function register(state: WxUpdateServerState, sessionId: string, version: number): WxUpdateServerState {
    return run(state, { type: 'client-registered', buildId: state.buildId, sessionId, version }).state
}

function synchronize(state: WxUpdateServerState, sessionId: string, version: number) {
    return run(state, { type: 'client-reported', buildId: state.buildId, sessionId, version })
}

test('registers the initial clean client without publishing a batch', () => {
    const result = run(createWxUpdateServerState('build-1'), {
        type: 'client-registered',
        buildId: 'build-1',
        sessionId: 'session-1',
        version: 0
    })

    assert.equal(result.state.activeSessionId, 'session-1')
    assert.deepEqual(result.commands, [])
})

test('publishes every delta missing from a newly registered client', () => {
    const state = addDeltas(createWxUpdateServerState('build-1'), 'delta-1', 'delta-2', 'delta-3')
    const result = synchronize(register(state, 'session-1', 0), 'session-1', 0)

    assert.deepEqual(result.commands, [
        {
            type: 'publish-batch',
            batch: {
                buildId: 'build-1',
                sessionId: 'session-1',
                fromVersion: 0,
                targetVersion: 3,
                deltas: [
                    { version: 1, code: 'delta-1' },
                    { version: 2, code: 'delta-2' },
                    { version: 3, code: 'delta-3' }
                ]
            }
        }
    ])
})

test('publishes only versions newer than the client', () => {
    const state = addDeltas(createWxUpdateServerState('build-1'), 'delta-1', 'delta-2', 'delta-3')
    const result = synchronize(register(state, 'session-1', 1), 'session-1', 1)

    const command = result.commands[0]
    assert.equal(command?.type, 'publish-batch')
    if (command?.type === 'publish-batch') {
        assert.equal(command.batch.fromVersion, 1)
        assert.deepEqual(
            command.batch.deltas.map((delta) => delta.version),
            [2, 3]
        )
    }
})

test('keeps one batch in flight while more deltas arrive', () => {
    let state = addDeltas(createWxUpdateServerState('build-1'), 'delta-1')
    state = register(state, 'session-1', 0)
    state = synchronize(state, 'session-1', 0).state
    state = run(state, { type: 'delta-added', code: 'delta-2' }).state

    const waiting = run(state, {
        type: 'client-reported',
        buildId: 'build-1',
        sessionId: 'session-1',
        version: 0
    })
    const retry = waiting.commands[0]
    assert.equal(retry?.type, 'publish-batch')
    if (retry?.type === 'publish-batch') assert.equal(retry.batch.targetVersion, 1)

    const acknowledged = run(waiting.state, {
        type: 'client-reported',
        buildId: 'build-1',
        sessionId: 'session-1',
        version: 1
    })
    const command = acknowledged.commands[0]
    assert.equal(command?.type, 'publish-batch')
    if (command?.type === 'publish-batch') {
        assert.equal(command.batch.fromVersion, 1)
        assert.equal(command.batch.targetVersion, 2)
    }
})

test('treats a lost acknowledgement as acknowledged when the client reports the target', () => {
    let state = addDeltas(createWxUpdateServerState('build-1'), 'delta-1', 'delta-2')
    state = register(state, 'session-1', 0)
    state = synchronize(state, 'session-1', 0).state

    const result = run(state, {
        type: 'client-reported',
        buildId: 'build-1',
        sessionId: 'session-1',
        version: 2
    })
    assert.equal(result.state.inFlight, undefined)
    assert.deepEqual(result.commands, [])
})

test('requests a full build for an impossible partial in-flight version', () => {
    let state = addDeltas(createWxUpdateServerState('build-1'), 'delta-1', 'delta-2', 'delta-3')
    state = register(state, 'session-1', 0)
    state = synchronize(state, 'session-1', 0).state

    const impossible = synchronize(state, 'session-1', 2)
    assert.deepEqual(impossible.commands, [{ type: 'request-full-build', reason: 'invalid-client-version' }])
    assert.equal(impossible.state.inFlight?.targetVersion, 3)
})

test('republishes after an atomic batch write fails', () => {
    let state = addDeltas(createWxUpdateServerState('build-1'), 'delta-1')
    state = register(state, 'session-1', 0)
    state = synchronize(state, 'session-1', 0).state
    state = run(state, {
        type: 'batch-publish-failed',
        sessionId: 'session-1',
        targetVersion: 1
    }).state

    const retry = run(state, {
        type: 'client-reported',
        buildId: 'build-1',
        sessionId: 'session-1',
        version: 0
    })
    assert.equal(retry.commands[0]?.type, 'publish-batch')
})

test('replays all retained deltas to a restarted App Service session', () => {
    let state = addDeltas(createWxUpdateServerState('build-1'), 'delta-1', 'delta-2')
    state = run(state, {
        type: 'client-registered',
        buildId: 'build-1',
        sessionId: 'old-session',
        version: 2
    }).state

    const registered = register(state, 'new-session', 0)
    const restarted = synchronize(registered, 'new-session', 0)
    const command = restarted.commands[0]
    assert.equal(command?.type, 'publish-batch')
    if (command?.type === 'publish-batch') assert.equal(command.batch.targetVersion, 2)
    assert.ok(restarted.state.retiredSessionIds.includes('old-session'))
})

test('ignores delayed reports from a retired session', () => {
    let state = createWxUpdateServerState('build-1')
    state = run(state, {
        type: 'client-registered',
        buildId: 'build-1',
        sessionId: 'old-session',
        version: 0
    }).state
    state = run(state, {
        type: 'client-registered',
        buildId: 'build-1',
        sessionId: 'new-session',
        version: 0
    }).state

    const delayed = run(state, {
        type: 'client-reported',
        buildId: 'build-1',
        sessionId: 'old-session',
        version: 0
    })
    assert.deepEqual(delayed.commands, [{ type: 'ignore-client', reason: 'retired-session' }])
    assert.equal(delayed.state.activeSessionId, 'new-session')
})

test('allows duplicate registration from the active session', () => {
    let state = createWxUpdateServerState('build-1')
    state = run(state, {
        type: 'client-registered',
        buildId: 'build-1',
        sessionId: 'session-1',
        version: 0
    }).state

    const duplicate = run(state, {
        type: 'client-registered',
        buildId: 'build-1',
        sessionId: 'session-1',
        version: 0
    })
    assert.deepEqual(duplicate.state.retiredSessionIds, [])
    assert.equal(duplicate.state.activeSessionId, 'session-1')
})

test('ignores stale-build and unknown-session reports', () => {
    const state = createWxUpdateServerState('build-2')
    const stale = run(state, {
        type: 'client-reported',
        buildId: 'build-1',
        sessionId: 'session-1',
        version: 0
    })
    assert.deepEqual(stale.commands, [{ type: 'ignore-client', reason: 'stale-build' }])

    const unknown = run(state, {
        type: 'client-reported',
        buildId: 'build-2',
        sessionId: 'session-1',
        version: 0
    })
    assert.deepEqual(unknown.commands, [{ type: 'ignore-client', reason: 'unknown-session' }])
})

test('requests a full build for invalid or ahead client versions', () => {
    const state = createWxUpdateServerState('build-1')
    const invalid = run(state, {
        type: 'client-registered',
        buildId: 'build-1',
        sessionId: 'session-1',
        version: -1
    })
    assert.deepEqual(invalid.commands, [{ type: 'request-full-build', reason: 'invalid-client-version' }])

    const ahead = run(state, {
        type: 'client-registered',
        buildId: 'build-1',
        sessionId: 'session-1',
        version: 1
    })
    assert.deepEqual(ahead.commands, [{ type: 'request-full-build', reason: 'client-version-ahead' }])
})

test('a committed full build starts a clean protocol generation', () => {
    let state = addDeltas(createWxUpdateServerState('build-1'), 'delta-1')
    state = register(state, 'session-1', 0)
    state = synchronize(state, 'session-1', 0).state

    const result = run(state, { type: 'full-build-committed', buildId: 'build-2' })
    assert.deepEqual(result.state, createWxUpdateServerState('build-2'))
    assert.deepEqual(result.commands, [])
})
