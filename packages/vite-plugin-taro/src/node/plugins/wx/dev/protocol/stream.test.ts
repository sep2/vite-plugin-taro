import assert from 'node:assert/strict'
import test from 'node:test'
import { Subject } from 'rxjs'
import type { DevProtocolCommand, DevProtocolEvent, DevProtocolState } from './model.ts'
import { createDevProtocol } from './stream.ts'

test('replays the current state while emitting each command only to observers already listening', () => {
    const events$ = new Subject<DevProtocolEvent>()
    const protocol = createDevProtocol({ buildId: 'build-1', events$ })
    const states: DevProtocolState[] = []
    const commands: DevProtocolCommand[] = []
    const stateSubscription = protocol.state$.subscribe(states.push.bind(states))
    const commandSubscription = protocol.commands$.subscribe(commands.push.bind(commands))

    events$.next({ type: 'ready' })
    events$.next({ type: 'client-connected', clientId: 'client-a' })
    events$.next({ type: 'client-connected', clientId: 'client-b' })

    assert.deepEqual(states, [
        { buildId: 'build-1', phase: 'starting' },
        { buildId: 'build-1', phase: 'awaiting-client' },
        { buildId: 'build-1', clientId: 'client-a', phase: 'active' },
        { buildId: 'build-1', nextClientId: 'client-b', phase: 'rebuilding' }
    ])
    assert.deepEqual(commands, [{ type: 'full-rebuild', clientId: 'client-b' }])

    const lateStates: DevProtocolState[] = []
    const lateCommands: DevProtocolCommand[] = []
    const lateStateSubscription = protocol.state$.subscribe(lateStates.push.bind(lateStates))
    const lateCommandSubscription = protocol.commands$.subscribe(lateCommands.push.bind(lateCommands))

    assert.deepEqual(lateStates, [{ buildId: 'build-1', nextClientId: 'client-b', phase: 'rebuilding' }])
    assert.deepEqual(lateCommands, [])

    events$.next({ type: 'rebuild-finished' })

    assert.deepEqual(lateStates, [
        { buildId: 'build-1', nextClientId: 'client-b', phase: 'rebuilding' },
        { buildId: 'build-1', clientId: 'client-b', phase: 'active' }
    ])

    lateCommandSubscription.unsubscribe()
    lateStateSubscription.unsubscribe()
    commandSubscription.unsubscribe()
    stateSubscription.unsubscribe()
})
