import assert from 'node:assert/strict'
import test from 'node:test'
import { of, Subject, throwError } from 'rxjs'
import { createBuildEvents$ } from './build-epochs.ts'
import type { BuildEvent, BuildRequest } from './types.ts'

test('serializes complete builds and emits ready only after bootstrap materializes', () => {
    const buildRequests$ = new Subject<BuildRequest>()
    const completions: Subject<void>[] = []
    const writes: string[] = []
    const events: BuildEvent[] = []
    const subscription = createBuildEvents$({
        buildRequests$,
        completeBuild() {
            const completion = new Subject<void>()
            completions.push(completion)
            return completion
        },
        writeBootstrap(epoch) {
            writes.push(epoch.buildId)
            return of(undefined)
        }
    }).subscribe((event) => events.push(event))

    buildRequests$.next(request('build-1', 'initial'))
    buildRequests$.next(request('build-2', 'client-changed'))
    assert.deepEqual(events, [{ kind: 'build-started', request: request('build-1', 'initial') }])
    assert.equal(completions.length, 1)

    completions[0].next()
    completions[0].complete()
    assert.deepEqual(writes, ['build-1'])
    assert.deepEqual(events, [
        { kind: 'build-started', request: request('build-1', 'initial') },
        { epoch: { buildId: 'build-1' }, kind: 'build-ready' },
        { kind: 'build-started', request: request('build-2', 'client-changed') }
    ])
    assert.equal(completions.length, 2)

    completions[1].next()
    completions[1].complete()
    assert.deepEqual(writes, ['build-1', 'build-2'])
    assert.deepEqual(events.at(-1), { epoch: { buildId: 'build-2' }, kind: 'build-ready' })

    subscription.unsubscribe()
})

test('reports a failed complete build and proceeds with the next request without a timer retry', () => {
    const buildRequests$ = new Subject<BuildRequest>()
    const events: BuildEvent[] = []
    const subscription = createBuildEvents$({
        buildRequests$,
        completeBuild(request) {
            return request.buildId === 'failed' ? throwError(() => new Error('output failed')) : of(undefined)
        },
        writeBootstrap() {
            return of(undefined)
        }
    }).subscribe((event) => events.push(event))

    buildRequests$.next(request('failed', 'native-output-changed'))
    buildRequests$.next(request('recovered', 'native-output-changed'))

    assert.equal(events[0].kind, 'build-started')
    assert.equal(events[1].kind, 'build-failed')
    assert.equal(events[2].kind, 'build-started')
    assert.deepEqual(events[3], { epoch: { buildId: 'recovered' }, kind: 'build-ready' })

    subscription.unsubscribe()
})

test('reports bootstrap failure as a failed build epoch', () => {
    const buildRequests$ = new Subject<BuildRequest>()
    const events: BuildEvent[] = []
    const subscription = createBuildEvents$({
        buildRequests$,
        completeBuild() {
            return of(undefined)
        },
        writeBootstrap(epoch) {
            return epoch.buildId === 'bootstrap-failed'
                ? throwError(() => new Error('bootstrap failed'))
                : of(undefined)
        }
    }).subscribe((event) => events.push(event))

    buildRequests$.next(request('bootstrap-failed', 'initial'))
    buildRequests$.next(request('recovered', 'initial'))

    assert.equal(events[0].kind, 'build-started')
    assert.equal(events[1].kind, 'build-failed')
    assert.equal(events[2].kind, 'build-started')
    assert.deepEqual(events[3], { epoch: { buildId: 'recovered' }, kind: 'build-ready' })

    subscription.unsubscribe()
})

function request(buildId: string, reason: BuildRequest['reason']): BuildRequest {
    return { buildId, reason }
}
