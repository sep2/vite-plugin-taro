import assert from 'node:assert/strict'
import test from 'node:test'
import { of, ReplaySubject, Subject } from 'rxjs'
import type { BuildEpoch, PatchHistory, UpdatePoll, UpdatePublication } from './types.ts'
import { createUpdatePublications$ } from './update-publication.ts'

const epoch: BuildEpoch = { buildId: 'build-1', endpoint: 'http://localhost/__vpt_hmr__' }

test('publishes a missing retained range only after a runtime poll', () => {
    const history$ = new ReplaySubject<PatchHistory>(1)
    const polls$ = new Subject<UpdatePoll>()
    const writes: UpdatePublication[] = []
    const publications: UpdatePublication[] = []
    const subscription = createUpdatePublications$({
        epoch,
        history$,
        polls$,
        writePublication(publication) {
            writes.push(publication)
            return of(undefined)
        }
    }).subscribe((publication) => publications.push(publication))

    history$.next({ buildId: 'build-1', patches: [] })
    assert.equal(writes.length, 0)

    polls$.next(poll(0))
    assert.equal(writes.length, 0)

    history$.next({
        buildId: 'build-1',
        patches: [{ patch: { code: 'first', fileName: 'src/first.ts' }, version: 1 }]
    })
    assert.deepEqual(
        writes.map(({ publicationId }) => publicationId),
        [1]
    )
    assert.deepEqual(
        writes[0].patches.map(({ version }) => version),
        [1]
    )

    polls$.next(poll(0))
    assert.deepEqual(
        writes.map(({ publicationId }) => publicationId),
        [1, 2]
    )
    assert.deepEqual(
        writes[1].patches.map(({ version }) => version),
        [1]
    )

    history$.next({
        buildId: 'build-1',
        patches: [
            { patch: { code: 'first', fileName: 'src/first.ts' }, version: 1 },
            { patch: { code: 'second', fileName: 'src/second.ts' }, version: 2 }
        ]
    })
    polls$.next(poll(1))
    assert.deepEqual(
        writes.map(({ publicationId }) => publicationId),
        [1, 2, 3]
    )
    assert.deepEqual(
        writes[2].patches.map(({ version }) => version),
        [2]
    )
    assert.deepEqual(publications, writes)

    subscription.unsubscribe()
})

function poll(appliedVersion: number): UpdatePoll {
    return { buildId: 'build-1', clientId: 'client-a', appliedVersion }
}
