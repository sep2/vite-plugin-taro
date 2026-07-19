import assert from 'node:assert/strict'
import test from 'node:test'
import { Subject } from 'rxjs'
import { createClientPollEvents$ } from './client-polls.ts'
import type { BuildEpoch, UpdatePoll } from './types.ts'

const epoch: BuildEpoch = { buildId: 'build-1' }

test('accepts one WX heap and turns a different client into a rebuild signal', () => {
    const polls$ = new Subject<UpdatePoll>()
    const events: unknown[] = []
    const subscription = createClientPollEvents$(epoch, polls$).subscribe((event) => events.push(event))

    polls$.next(poll('client-a', 0))
    polls$.next(poll('client-a', 1))
    polls$.next(poll('client-b', 0))

    assert.deepEqual(events, [
        { kind: 'accepted-poll', poll: poll('client-a', 0) },
        { kind: 'accepted-poll', poll: poll('client-a', 1) },
        { buildId: 'build-1', kind: 'rebuild-needed', reason: 'client-changed' }
    ])

    subscription.unsubscribe()
})

test('ignores polls for a different build epoch', () => {
    const polls$ = new Subject<UpdatePoll>()
    const events: unknown[] = []
    const subscription = createClientPollEvents$(epoch, polls$).subscribe((event) => events.push(event))

    polls$.next({ appliedVersion: 0, buildId: 'other-build', clientId: 'client-a' })
    assert.deepEqual(events, [])

    subscription.unsubscribe()
})

function poll(clientId: string, appliedVersion: number): UpdatePoll {
    return { appliedVersion, buildId: 'build-1', clientId }
}
