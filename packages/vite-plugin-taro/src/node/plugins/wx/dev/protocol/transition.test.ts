import assert from 'node:assert/strict'
import test from 'node:test'
import { createInitialDevProtocolState } from './model.ts'
import { transition } from './transition.ts'

test('becomes ready for the first WX heap after initial output is prepared', () => {
    const starting = createInitialDevProtocolState('build-1')
    const result = transition(starting, { type: 'ready' })

    assert.deepEqual(result, {
        state: { buildId: 'build-1', phase: 'awaiting-client' },
        commands: []
    })
})

test('keeps the active heap when it reconnects with the same client ID', () => {
    const active = { buildId: 'build-1', clientId: 'client-a', phase: 'active' } as const
    const result = transition(active, { type: 'client-connected', clientId: 'client-a' })

    assert.equal(result.state, active)
    assert.deepEqual(result.commands, [])
})

test('fully rebuilds before replacing the active heap', () => {
    const active = { buildId: 'build-1', clientId: 'client-a', phase: 'active' } as const
    let result = transition(active, { type: 'client-connected', clientId: 'client-b' })

    assert.deepEqual(result, {
        state: { buildId: 'build-1', nextClientId: 'client-b', phase: 'rebuilding' },
        commands: [{ type: 'full-rebuild', clientId: 'client-b' }]
    })

    result = transition(result.state, { type: 'rebuild-finished' })
    assert.deepEqual(result, {
        state: { buildId: 'build-1', clientId: 'client-b', phase: 'active' },
        commands: []
    })
})

test('stops idempotently', () => {
    const active = { buildId: 'build-1', clientId: 'client-a', phase: 'active' } as const
    const stopped = transition(active, { type: 'stop' })

    assert.deepEqual(stopped, {
        state: { buildId: 'build-1', phase: 'stopped' },
        commands: [{ type: 'close-session' }]
    })
    assert.equal(transition(stopped.state, { type: 'stop' }).state, stopped.state)
})
