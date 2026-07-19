import assert from 'node:assert/strict'
import test from 'node:test'
import { of, Subject } from 'rxjs'
import { createHmrTopology } from './session.ts'
import type { BuildRequest, HmrEvent, SafePatch, UpdatePoll, UpdatePublication } from './types.ts'

test('ends the prior epoch at build start and starts a fresh version-zero history after replacement output is ready', () => {
    const buildRequests$ = new Subject<BuildRequest>()
    const polls$ = new Subject<UpdatePoll>()
    const replacementBuild$ = new Subject<void>()
    const patchStreams = new Map<string, Subject<SafePatch>>()
    const events: HmrEvent[] = []
    const writes: UpdatePublication[] = []
    const subscription = createHmrTopology({
        buildRequests$,
        completeBuild(request) {
            return request.buildId === 'build-2' ? replacementBuild$ : of(undefined)
        },
        maximumPatchCount: 10,
        polls$,
        safePatchesForEpoch(epoch) {
            const patches$ = new Subject<SafePatch>()
            patchStreams.set(epoch.buildId, patches$)
            return patches$
        },
        writeBootstrap() {
            return of(undefined)
        },
        writePublication(publication) {
            writes.push(publication)
            return of(undefined)
        }
    }).subscribe((event) => events.push(event))

    buildRequests$.next(request('build-1', 'initial'))
    patchStreams.get('build-1')?.next(patch('first'))
    polls$.next(poll('build-1', 'client-a', 0))
    assert.deepEqual(
        writes.map(({ buildId, publicationId }) => [buildId, publicationId]),
        [['build-1', 1]]
    )

    buildRequests$.next(request('build-2', 'client-changed'))
    patchStreams.get('build-1')?.next(patch('stale'))
    polls$.next(poll('build-1', 'client-a', 0))
    assert.equal(writes.length, 1)

    replacementBuild$.next()
    replacementBuild$.complete()
    patchStreams.get('build-2')?.next(patch('replacement'))
    polls$.next(poll('build-2', 'client-a', 0))

    assert.deepEqual(
        writes.map(({ buildId, publicationId }) => [buildId, publicationId]),
        [
            ['build-1', 1],
            ['build-2', 1]
        ]
    )
    assert.deepEqual(
        writes[1].patches.map(({ version }) => version),
        [1]
    )
    assert.equal(events.at(-1)?.kind, 'update-published')

    subscription.unsubscribe()
})

test('stops the active epoch and requests one rebuild when another WX heap polls', () => {
    const buildRequests$ = new Subject<BuildRequest>()
    const polls$ = new Subject<UpdatePoll>()
    const patches$ = new Subject<SafePatch>()
    const events: HmrEvent[] = []
    const writes: UpdatePublication[] = []
    const subscription = createHmrTopology({
        buildRequests$,
        completeBuild() {
            return of(undefined)
        },
        maximumPatchCount: 10,
        polls$,
        safePatchesForEpoch() {
            return patches$
        },
        writeBootstrap() {
            return of(undefined)
        },
        writePublication(publication) {
            writes.push(publication)
            return of(undefined)
        }
    }).subscribe((event) => events.push(event))

    buildRequests$.next(request('build-1', 'initial'))
    patches$.next(patch('first'))
    polls$.next(poll('build-1', 'client-a', 0))
    polls$.next(poll('build-1', 'client-b', 0))
    polls$.next(poll('build-1', 'client-a', 0))

    assert.equal(writes.length, 1)
    assert.deepEqual(rebuildSignals(events), [{ buildId: 'build-1', kind: 'rebuild-needed', reason: 'client-changed' }])

    subscription.unsubscribe()
})

test('stops at the retained history bound instead of publishing beyond it', () => {
    const buildRequests$ = new Subject<BuildRequest>()
    const polls$ = new Subject<UpdatePoll>()
    const patches$ = new Subject<SafePatch>()
    const events: HmrEvent[] = []
    const writes: UpdatePublication[] = []
    const subscription = createHmrTopology({
        buildRequests$,
        completeBuild() {
            return of(undefined)
        },
        maximumPatchCount: 2,
        polls$,
        safePatchesForEpoch() {
            return patches$
        },
        writeBootstrap() {
            return of(undefined)
        },
        writePublication(publication) {
            writes.push(publication)
            return of(undefined)
        }
    }).subscribe((event) => events.push(event))

    buildRequests$.next(request('build-1', 'initial'))
    patches$.next(patch('first'))
    patches$.next(patch('second'))
    polls$.next(poll('build-1', 'client-a', 0))
    patches$.next(patch('third'))

    assert.equal(writes.length, 0)
    assert.deepEqual(rebuildSignals(events), [{ buildId: 'build-1', kind: 'rebuild-needed', reason: 'history-limit' }])

    subscription.unsubscribe()
})

test('stops and requests a replacement baseline when a runtime reports a version ahead of retained history', () => {
    const buildRequests$ = new Subject<BuildRequest>()
    const polls$ = new Subject<UpdatePoll>()
    const patches$ = new Subject<SafePatch>()
    const events: HmrEvent[] = []
    const subscription = createHmrTopology({
        buildRequests$,
        completeBuild() {
            return of(undefined)
        },
        maximumPatchCount: 10,
        polls$,
        safePatchesForEpoch() {
            return patches$
        },
        writeBootstrap() {
            return of(undefined)
        },
        writePublication() {
            return of(undefined)
        }
    }).subscribe((event) => events.push(event))

    buildRequests$.next(request('build-1', 'initial'))
    polls$.next(poll('build-1', 'client-a', 1))

    assert.deepEqual(rebuildSignals(events), [
        { buildId: 'build-1', kind: 'rebuild-needed', reason: 'runtime-desynchronized' }
    ])

    subscription.unsubscribe()
})

test('rejects an invalid history bound before subscribing to any edge', () => {
    assert.throws(
        () =>
            createHmrTopology({
                buildRequests$: new Subject<BuildRequest>(),
                completeBuild() {
                    return of(undefined)
                },
                maximumPatchCount: 0,
                polls$: new Subject<UpdatePoll>(),
                safePatchesForEpoch() {
                    return new Subject<SafePatch>()
                },
                writeBootstrap() {
                    return of(undefined)
                },
                writePublication() {
                    return of(undefined)
                }
            }),
        /maximumPatchCount/
    )
})

function rebuildSignals(events: readonly HmrEvent[]) {
    return events.filter(
        (event): event is Extract<HmrEvent, { kind: 'rebuild-needed' }> => event.kind === 'rebuild-needed'
    )
}

function request(buildId: string, reason: BuildRequest['reason']): BuildRequest {
    return { buildId, reason }
}

function poll(buildId: string, clientId: string, appliedVersion: number): UpdatePoll {
    return { appliedVersion, buildId, clientId }
}

function patch(code: string): SafePatch {
    return { code, fileName: `src/${code}.ts` }
}
