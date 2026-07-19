import assert from 'node:assert/strict'
import test from 'node:test'
import { Observable, of, Subject, throwError } from 'rxjs'
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

test('keeps a version-zero poll open until the first patch instead of treating it as desynchronized', () => {
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
    polls$.next(poll('build-1', 'client-a', 0))

    assert.deepEqual(
        events.filter((event) => event.kind === 'history-retained').map(({ history }) => history.patches),
        [[]]
    )
    assert.equal(writes.length, 0)
    assert.deepEqual(rebuildSignals(events), [])

    patches$.next(patch('first'))
    assert.deepEqual(
        writes[0].patches.map(({ version }) => version),
        [1]
    )

    subscription.unsubscribe()
})

test('reports a recoverable update-write failure through the root and retries on the next poll', () => {
    const buildRequests$ = new Subject<BuildRequest>()
    const polls$ = new Subject<UpdatePoll>()
    const patches$ = new Subject<SafePatch>()
    const events: HmrEvent[] = []
    let attempts = 0
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
            attempts += 1
            return attempts === 1 ? throwError(() => new Error('write failed')) : of(undefined)
        }
    }).subscribe((event) => events.push(event))

    buildRequests$.next(request('build-1', 'initial'))
    patches$.next(patch('first'))
    polls$.next(poll('build-1', 'client-a', 0))
    polls$.next(poll('build-1', 'client-a', 0))

    assert.deepEqual(
        events.filter((event) => event.kind.startsWith('update-')).map(({ kind }) => kind),
        ['update-write-failed', 'update-published']
    )
    assert.deepEqual(rebuildSignals(events), [])

    subscription.unsubscribe()
})

test('cancels an in-flight update write before a replacement complete build begins', () => {
    const buildRequests$ = new Subject<BuildRequest>()
    const polls$ = new Subject<UpdatePoll>()
    const patches$ = new Subject<SafePatch>()
    let updateWriteCancelled = false
    let replacementStartedAfterCancellation = false
    const subscription = createHmrTopology({
        buildRequests$,
        completeBuild(request) {
            if (request.buildId === 'build-2') {
                replacementStartedAfterCancellation = updateWriteCancelled
            }
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
            return new Observable<void>(() => () => {
                updateWriteCancelled = true
            })
        }
    }).subscribe()

    buildRequests$.next(request('build-1', 'initial'))
    patches$.next(patch('first'))
    polls$.next(poll('build-1', 'client-a', 0))
    buildRequests$.next(request('build-2', 'native-output-changed'))

    assert.equal(updateWriteCancelled, true)
    assert.equal(replacementStartedAfterCancellation, true)
    subscription.unsubscribe()
})

test('accepts the edge feedback from a local history-limit signal as a fresh build epoch', () => {
    const buildRequests$ = new Subject<BuildRequest>()
    const polls$ = new Subject<UpdatePoll>()
    const patchStreams = new Map<string, Subject<SafePatch>>()
    const events: HmrEvent[] = []
    const writes: UpdatePublication[] = []
    const subscription = createHmrTopology({
        buildRequests$,
        completeBuild() {
            return of(undefined)
        },
        maximumPatchCount: 2,
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
    patchStreams.get('build-1')?.next(patch('second'))
    assert.deepEqual(rebuildSignals(events), [{ buildId: 'build-1', kind: 'rebuild-needed', reason: 'history-limit' }])

    buildRequests$.next(request('build-2', 'history-limit'))
    patchStreams.get('build-2')?.next(patch('replacement'))
    polls$.next(poll('build-2', 'client-b', 0))

    assert.deepEqual(
        writes.map(({ buildId, patches }) => [buildId, patches.map(({ version }) => version)]),
        [['build-2', [1]]]
    )

    subscription.unsubscribe()
})

test('shares one topology lifetime across subscribers instead of duplicating physical effects', () => {
    const buildRequests$ = new Subject<BuildRequest>()
    const polls$ = new Subject<UpdatePoll>()
    const patches$ = new Subject<SafePatch>()
    let completeBuilds = 0
    let bootstrapWrites = 0
    let patchSources = 0
    let updateWrites = 0
    const topology$ = createHmrTopology({
        buildRequests$,
        completeBuild() {
            completeBuilds += 1
            return of(undefined)
        },
        maximumPatchCount: 10,
        polls$,
        safePatchesForEpoch() {
            patchSources += 1
            return patches$
        },
        writeBootstrap() {
            bootstrapWrites += 1
            return of(undefined)
        },
        writePublication() {
            updateWrites += 1
            return of(undefined)
        }
    })
    const first = topology$.subscribe()
    const second = topology$.subscribe()

    buildRequests$.next(request('build-1', 'initial'))
    patches$.next(patch('first'))
    polls$.next(poll('build-1', 'client-a', 0))

    assert.deepEqual(
        { bootstrapWrites, completeBuilds, patchSources, updateWrites },
        {
            bootstrapWrites: 1,
            completeBuilds: 1,
            patchSources: 1,
            updateWrites: 1
        }
    )

    second.unsubscribe()
    first.unsubscribe()
})

test('tears down retained history and in-flight publication when the sole root subscriber closes', () => {
    const buildRequests$ = new Subject<BuildRequest>()
    const polls$ = new Subject<UpdatePoll>()
    const patches$ = new Subject<SafePatch>()
    let patchSourceClosed = false
    let updateWriteCancelled = false
    const subscription = createHmrTopology({
        buildRequests$,
        completeBuild() {
            return of(undefined)
        },
        maximumPatchCount: 10,
        polls$,
        safePatchesForEpoch() {
            return new Observable<SafePatch>((subscriber) => {
                const patchSubscription = patches$.subscribe(subscriber)
                return () => {
                    patchSourceClosed = true
                    patchSubscription.unsubscribe()
                }
            })
        },
        writeBootstrap() {
            return of(undefined)
        },
        writePublication() {
            return new Observable<void>(() => () => {
                updateWriteCancelled = true
            })
        }
    }).subscribe()

    buildRequests$.next(request('build-1', 'initial'))
    patches$.next(patch('first'))
    polls$.next(poll('build-1', 'client-a', 0))
    subscription.unsubscribe()

    assert.equal(updateWriteCancelled, true)
    assert.equal(patchSourceClosed, true)
})

test('supports synchronous edge feedback from a local rebuild signal without duplicating the next epoch', () => {
    const buildRequests$ = new Subject<BuildRequest>()
    const polls$ = new Subject<UpdatePoll>()
    const patchStreams = new Map<string, Subject<SafePatch>>()
    const events: HmrEvent[] = []
    const subscription = createHmrTopology({
        buildRequests$,
        completeBuild() {
            return of(undefined)
        },
        maximumPatchCount: 2,
        polls$,
        safePatchesForEpoch(epoch) {
            const patches$ = new Subject<SafePatch>()
            patchStreams.set(epoch.buildId, patches$)
            return patches$
        },
        writeBootstrap() {
            return of(undefined)
        },
        writePublication() {
            return of(undefined)
        }
    }).subscribe((event) => {
        events.push(event)
        if (event.kind === 'rebuild-needed') {
            buildRequests$.next(request('build-2', event.reason))
        }
    })

    buildRequests$.next(request('build-1', 'initial'))
    patchStreams.get('build-1')?.next(patch('first'))
    patchStreams.get('build-1')?.next(patch('second'))

    assert.deepEqual(
        events.filter((event) => event.kind === 'build-started').map(({ request }) => request.buildId),
        ['build-1', 'build-2']
    )
    assert.deepEqual(
        events.filter((event) => event.kind === 'build-ready').map(({ epoch }) => epoch.buildId),
        ['build-1', 'build-2']
    )
    assert.deepEqual(rebuildSignals(events), [{ buildId: 'build-1', kind: 'rebuild-needed', reason: 'history-limit' }])

    subscription.unsubscribe()
})

test('converts a safe-patch source failure into a rebuild signal and keeps the root stream alive', () => {
    const buildRequests$ = new Subject<BuildRequest>()
    const polls$ = new Subject<UpdatePoll>()
    const events: HmrEvent[] = []
    const patchStreams = new Map<string, Subject<SafePatch>>()
    let attempts = 0
    const subscription = createHmrTopology({
        buildRequests$,
        completeBuild() {
            return of(undefined)
        },
        maximumPatchCount: 10,
        polls$,
        safePatchesForEpoch(epoch) {
            attempts += 1
            if (epoch.buildId === 'build-1') {
                throw new Error('DevEngine patch stream failed')
            }

            const patches$ = new Subject<SafePatch>()
            patchStreams.set(epoch.buildId, patches$)
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
    assert.deepEqual(rebuildSignals(events), [
        { buildId: 'build-1', kind: 'rebuild-needed', reason: 'rolldown-full-reload' }
    ])
    assert.equal(attempts, 1)

    buildRequests$.next(request('build-2', 'rolldown-full-reload'))
    patchStreams.get('build-2')?.next(patch('recovered'))
    assert.equal(events.at(-1)?.kind, 'history-retained')

    subscription.unsubscribe()
})

test('does not create a patch scope when bootstrap fails and recovers at the next successful build', () => {
    const buildRequests$ = new Subject<BuildRequest>()
    const polls$ = new Subject<UpdatePoll>()
    const events: HmrEvent[] = []
    const patchStreams = new Map<string, Subject<SafePatch>>()
    let patchSources = 0
    const subscription = createHmrTopology({
        buildRequests$,
        completeBuild() {
            return of(undefined)
        },
        maximumPatchCount: 10,
        polls$,
        safePatchesForEpoch(epoch) {
            patchSources += 1
            const patches$ = new Subject<SafePatch>()
            patchStreams.set(epoch.buildId, patches$)
            return patches$
        },
        writeBootstrap(epoch) {
            return epoch.buildId === 'build-1' ? throwError(() => new Error('bootstrap failed')) : of(undefined)
        },
        writePublication() {
            return of(undefined)
        }
    }).subscribe((event) => events.push(event))

    buildRequests$.next(request('build-1', 'initial'))
    assert.deepEqual(
        events.map(({ kind }) => kind),
        ['build-started', 'build-failed']
    )
    assert.equal(patchSources, 0)

    buildRequests$.next(request('build-2', 'initial'))
    patchStreams.get('build-2')?.next(patch('recovered'))
    assert.equal(patchSources, 1)
    assert.equal(events.at(-1)?.kind, 'history-retained')

    subscription.unsubscribe()
})

test('stops and requests a replacement baseline when a runtime reports a version outside retained history', () => {
    for (const appliedVersion of [-1, 1]) {
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
        polls$.next(poll('build-1', 'client-a', appliedVersion))

        assert.deepEqual(rebuildSignals(events), [
            { buildId: 'build-1', kind: 'rebuild-needed', reason: 'runtime-desynchronized' }
        ])
        subscription.unsubscribe()
    }
})

test('rejects every invalid history bound before subscribing to any edge', () => {
    for (const maximumPatchCount of [0, -1, 1.5, Number.POSITIVE_INFINITY]) {
        assert.throws(
            () =>
                createHmrTopology({
                    buildRequests$: new Subject<BuildRequest>(),
                    completeBuild() {
                        return of(undefined)
                    },
                    maximumPatchCount,
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
    }
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
