import assert from 'node:assert/strict'
import test from 'node:test'
import { Subject } from 'rxjs'
import { createClientPolls$ } from './client-polls.ts'
import type { BuildEpoch, UpdatePoll } from './types.ts'

const epoch: BuildEpoch = { buildId: 'build-1' }

test('accepts one WX heap and turns a different client into a rebuild command', () => {
    const polls$ = new Subject<UpdatePoll>()
    const values: unknown[] = []
    const subscription = createClientPolls$(epoch, polls$).subscribe((value) => values.push(value))

    polls$.next(poll('client-a', 0))
    polls$.next(poll('client-a', 1))
    polls$.next(poll('client-b', 0))

    assert.deepEqual(values, [
        { kind: 'accepted-poll', poll: poll('client-a', 0) },
        { kind: 'accepted-poll', poll: poll('client-a', 1) },
        { buildId: 'build-1', kind: 'request-rebuild', reason: 'client-changed' }
    ])

    subscription.unsubscribe()
})

test('ignores polls for a different build epoch', () => {
    const polls$ = new Subject<UpdatePoll>()
    const values: unknown[] = []
    const subscription = createClientPolls$(epoch, polls$).subscribe((value) => values.push(value))

    polls$.next({ appliedVersion: 0, buildId: 'other-build', clientId: 'client-a', requestId: 'request-0' })
    assert.deepEqual(values, [])

    subscription.unsubscribe()
})

function poll(clientId: string, appliedVersion: number): UpdatePoll {
    return { appliedVersion, buildId: 'build-1', clientId, requestId: `request-${clientId}-${appliedVersion}` }
}
