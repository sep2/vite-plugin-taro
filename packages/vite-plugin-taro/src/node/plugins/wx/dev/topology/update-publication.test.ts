import assert from 'node:assert/strict'
import test from 'node:test'
import { of, ReplaySubject, Subject, throwError } from 'rxjs'
import type { PatchHistory, UpdatePoll, UpdatePublication, UpdatePublicationResult } from './types.ts'
import { createUpdatePublications$ } from './update-publication.ts'

test('publishes a missing retained range only after an accepted runtime poll', () => {
    const history$ = new ReplaySubject<PatchHistory>(1)
    const polls$ = new Subject<UpdatePoll>()
    const writes: UpdatePublication[] = []
    const results: UpdatePublicationResult[] = []
    const subscription = createUpdatePublications$({
        buildId: 'build-1',
        history$,
        polls$,
        writePublication(publication) {
            writes.push(publication)
            return of(undefined)
        }
    }).subscribe((result) => results.push(result))

    history$.next({ patches: [] })
    assert.equal(writes.length, 0)

    polls$.next(poll(0))
    assert.equal(writes.length, 0)

    history$.next({ patches: [{ patch: { code: 'first', fileName: 'src/first.ts' }, version: 1 }] })
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
    assert.deepEqual(
        results.map(({ kind }) => kind),
        ['update-published', 'update-published', 'update-published']
    )

    subscription.unsubscribe()
})

test('reports a write failure and lets a later poll retry without terminating publication', () => {
    const history$ = new ReplaySubject<PatchHistory>(1)
    const polls$ = new Subject<UpdatePoll>()
    const results: UpdatePublicationResult[] = []
    let attempts = 0
    const subscription = createUpdatePublications$({
        buildId: 'build-1',
        history$,
        polls$,
        writePublication() {
            attempts += 1
            return attempts === 1 ? throwError(() => new Error('disk unavailable')) : of(undefined)
        }
    }).subscribe((result) => results.push(result))

    history$.next({ patches: [{ patch: { code: 'first', fileName: 'src/first.ts' }, version: 1 }] })
    polls$.next(poll(0))
    polls$.next(poll(0))

    assert.equal(attempts, 2)
    assert.deepEqual(
        results.map(({ kind }) => kind),
        ['update-write-failed', 'update-published']
    )

    subscription.unsubscribe()
})

function poll(appliedVersion: number): UpdatePoll {
    return { appliedVersion, buildId: 'build-1', clientId: 'client-a' }
}
