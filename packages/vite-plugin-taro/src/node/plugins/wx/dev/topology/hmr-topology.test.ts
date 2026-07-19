import assert from 'node:assert/strict'
import test from 'node:test'
import { of, Subject } from 'rxjs'
import { createHmrTopology$ } from './hmr-topology.ts'
import type {
    BuildRequest,
    EpochHistory,
    EpochPublication,
    HistoryLimitReached,
    SafePatch,
    UpdatePoll,
    UpdatePublication
} from './types.ts'

test('ends the prior history/publication scope when a replacement build starts and resets versions for the new epoch', () => {
    const buildRequests$ = new Subject<BuildRequest>()
    const polls$ = new Subject<UpdatePoll>()
    const replacementBuild$ = new Subject<void>()
    const patchStreams = new Map<string, Subject<SafePatch>>()
    const histories: EpochHistory[] = []
    const publications: EpochPublication[] = []
    const historyLimits: HistoryLimitReached[] = []
    const writes: UpdatePublication[] = []
    const topology = createHmrTopology$({
        buildRequests$,
        completeBuild(request) {
            return request.buildId === 'build-2' ? replacementBuild$ : of(undefined)
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
    })
    const historySubscription = topology.histories$.subscribe((history) => histories.push(history))
    const publicationSubscription = topology.publications$.subscribe((publication) => publications.push(publication))
    const historyLimitSubscription = topology.historyLimits$.subscribe((limit) => historyLimits.push(limit))

    buildRequests$.next(request('build-1', 'initial'))
    patchStreams.get('build-1')?.next(patch('first'))
    polls$.next(poll('build-1', 0))
    assert.deepEqual(
        writes.map(({ epoch }) => epoch.buildId),
        ['build-1']
    )
    assert.deepEqual(
        writes[0].patches.map(({ version }) => version),
        [1]
    )

    buildRequests$.next(request('build-2', 'client-changed'))
    patchStreams.get('build-1')?.next(patch('stale'))
    polls$.next(poll('build-1', 0))
    assert.deepEqual(
        writes.map(({ epoch }) => epoch.buildId),
        ['build-1']
    )

    replacementBuild$.next()
    replacementBuild$.complete()
    patchStreams.get('build-2')?.next(patch('replacement'))
    polls$.next(poll('build-2', 0))

    assert.deepEqual(
        writes.map(({ epoch, publicationId }) => [epoch.buildId, publicationId]),
        [
            ['build-1', 1],
            ['build-2', 1]
        ]
    )
    assert.deepEqual(
        writes[1].patches.map(({ version }) => version),
        [1]
    )
    assert.equal(histories.at(-1)?.epoch.buildId, 'build-2')
    assert.deepEqual(historyLimits, [])
    assert.deepEqual(
        publications.map(({ publication }) => publication),
        writes
    )

    historyLimitSubscription.unsubscribe()
    publicationSubscription.unsubscribe()
    historySubscription.unsubscribe()
})

test('emits one history-limit fact for each build epoch', () => {
    const buildRequests$ = new Subject<BuildRequest>()
    const polls$ = new Subject<UpdatePoll>()
    const patches$ = new Subject<SafePatch>()
    const limits: HistoryLimitReached[] = []
    const topology = createHmrTopology$({
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
        writePublication() {
            return of(undefined)
        }
    })
    const subscription = topology.historyLimits$.subscribe((limit) => limits.push(limit))

    buildRequests$.next(request('build-1', 'initial'))
    patches$.next(patch('first'))
    patches$.next(patch('second'))
    patches$.next(patch('third'))

    buildRequests$.next(request('build-2', 'history-limit'))
    patches$.next(patch('replacement-first'))
    patches$.next(patch('replacement-second'))

    assert.deepEqual(
        limits.map(({ epoch, history }) => [epoch.buildId, history.patches.length]),
        [
            ['build-1', 2],
            ['build-2', 2]
        ]
    )
    subscription.unsubscribe()
})

function request(buildId: string, reason: BuildRequest['reason']): BuildRequest {
    return { buildId, endpoint: 'http://localhost/__vpt_hmr__', reason }
}

function poll(buildId: string, appliedVersion: number): UpdatePoll {
    return { buildId, clientId: 'client-a', appliedVersion }
}

function patch(code: string): SafePatch {
    return { code, fileName: `src/${code}.ts` }
}
