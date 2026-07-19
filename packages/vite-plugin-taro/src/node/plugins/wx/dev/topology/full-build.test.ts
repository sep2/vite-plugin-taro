import assert from 'node:assert/strict'
import test from 'node:test'
import { of, Subject, throwError } from 'rxjs'
import { createBuildLifecycle$ } from './full-build.ts'
import type { BuildLifecycle, BuildRequest } from './types.ts'

test('serializes complete builds and publishes each epoch only after bootstrap materializes', () => {
    const buildRequests$ = new Subject<BuildRequest>()
    const completions: Subject<void>[] = []
    const writes: string[] = []
    const lifecycle: BuildLifecycle[] = []
    const subscription = createBuildLifecycle$({
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
    }).subscribe((value) => lifecycle.push(value))

    buildRequests$.next(request('build-1', 'initial'))
    buildRequests$.next(request('build-2', 'client-changed'))
    assert.deepEqual(lifecycle, [{ kind: 'started', request: request('build-1', 'initial') }])
    assert.equal(completions.length, 1)

    completions[0].next()
    completions[0].complete()
    assert.deepEqual(writes, ['build-1'])
    assert.deepEqual(lifecycle, [
        { kind: 'started', request: request('build-1', 'initial') },
        { kind: 'succeeded', epoch: { buildId: 'build-1', endpoint: 'http://localhost/__vpt_hmr__' } },
        { kind: 'started', request: request('build-2', 'client-changed') }
    ])
    assert.equal(completions.length, 2)

    completions[1].next()
    completions[1].complete()
    assert.deepEqual(writes, ['build-1', 'build-2'])
    assert.deepEqual(lifecycle.at(-1), {
        kind: 'succeeded',
        epoch: { buildId: 'build-2', endpoint: 'http://localhost/__vpt_hmr__' }
    })

    subscription.unsubscribe()
})

test('reports a failed build and proceeds with the next rebuild request without a timer retry', () => {
    const buildRequests$ = new Subject<BuildRequest>()
    const lifecycle: BuildLifecycle[] = []
    const subscription = createBuildLifecycle$({
        buildRequests$,
        completeBuild(request) {
            return request.buildId === 'failed' ? throwError(() => new Error('output failed')) : of(undefined)
        },
        writeBootstrap() {
            return of(undefined)
        }
    }).subscribe((value) => lifecycle.push(value))

    buildRequests$.next(request('failed', 'native-output-changed'))
    buildRequests$.next(request('recovered', 'native-output-changed'))

    assert.equal(lifecycle[0].kind, 'started')
    assert.equal(lifecycle[1].kind, 'failed')
    assert.equal(lifecycle[2].kind, 'started')
    assert.deepEqual(lifecycle[3], {
        kind: 'succeeded',
        epoch: { buildId: 'recovered', endpoint: 'http://localhost/__vpt_hmr__' }
    })

    subscription.unsubscribe()
})

test('reports bootstrap failure as a failed build epoch', () => {
    const buildRequests$ = new Subject<BuildRequest>()
    const lifecycle: BuildLifecycle[] = []
    const subscription = createBuildLifecycle$({
        buildRequests$,
        completeBuild() {
            return of(undefined)
        },
        writeBootstrap(epoch) {
            return epoch.buildId === 'bootstrap-failed'
                ? throwError(() => new Error('bootstrap failed'))
                : of(undefined)
        }
    }).subscribe((value) => lifecycle.push(value))

    buildRequests$.next(request('bootstrap-failed', 'initial'))
    buildRequests$.next(request('recovered', 'initial'))

    assert.equal(lifecycle[0].kind, 'started')
    assert.equal(lifecycle[1].kind, 'failed')
    assert.equal(lifecycle[2].kind, 'started')
    assert.deepEqual(lifecycle[3], {
        kind: 'succeeded',
        epoch: { buildId: 'recovered', endpoint: 'http://localhost/__vpt_hmr__' }
    })

    subscription.unsubscribe()
})

function request(buildId: string, reason: BuildRequest['reason']): BuildRequest {
    return { buildId, endpoint: 'http://localhost/__vpt_hmr__', reason }
}
